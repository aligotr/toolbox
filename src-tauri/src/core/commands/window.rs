//! Окно: команда сброса геометрии, прилипание к краям и жизненный цикл
//! главного окна.
//!
//! Восстановление геометрии вызывают `setup` и команда сброса, поэтому
//! правило живёт в одной копии. Это адаптер к окну ОС, а не домен: сюда же
//! относится и отложенная запись положения (ADR 0014), и подписка
//! на прилипание (ADR 0064).

use std::sync::Arc;

use serde_json::Value;
use tauri::{AppHandle, Manager, PhysicalPosition, Position, State, WebviewWindow, WindowEvent};

use crate::core::infra::error::AppResult;
use crate::core::runtime::Runtime;
use crate::core::services::settings::{self, Settings};
use crate::core::services::window;

use super::settings::commit_settings;

/// Метка главного окна из `tauri.conf.json`. Через неё окно находится
/// при восстановлении геометрии, сбросе размера и показе после запуска.
pub(crate) const MAIN_WINDOW: &str = "main";

/// Сбрасывает геометрию окна: остальные разделы не трогаются.
#[tauri::command]
pub(crate) fn window_reset(app: AppHandle, runtime: State<'_, Runtime>) -> AppResult<Settings> {
    let updated = commit_settings(&app, &runtime, settings::SECTION_WINDOW, |current| {
        Ok(settings::reset_window(current))
    })?;

    // Сброс применяется сразу: иначе до перезапуска на экране ничего
    // не меняется, и нажатие выглядит несработавшим.
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        restore_geometry(&app, &window);
    }

    log::debug!("Геометрия окна сброшена");
    Ok(updated)
}

/// Показывает главное окно с сохранённой геометрией.
///
/// Окно создаётся скрытым (`visible: false`): восстановление размера и места
/// происходит до `show()`, поэтому скачка из системного угла не видно.
pub(crate) fn show_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        log::error!("Главное окно '{MAIN_WINDOW}' не найдено: показ и геометрия пропущены");
        return;
    };

    let adjusted = restore_geometry(app, &window);

    if let Err(error) = window.show() {
        log::error!("Не удалось показать главное окно: {error}");
    }

    // Прилипание не зависит от хранилища: окно ведёт себя одинаково,
    // даже когда папка программы недоступна.
    start_snapping(app, &window);

    // Без хранилища сохранять некуда: при блокировке папка недоступна,
    // и поток записи только тратил бы время.
    if app.state::<Runtime>().storage.is_some() {
        start_geometry_saver(app, &window);

        // Сохранённое место оказалось недостижимым (монитор отключили
        // или экран меньше окна). Записываем фактическое, иначе прижатие
        // повторялось бы при каждом запуске.
        if adjusted {
            save_geometry(app, &window);
        }
    }
}

/// Дописывает отложенную геометрию при выходе.
///
/// Последнее движение окна может ещё ждать таймера. Без сброса оно пропадёт:
/// файл останется с предыдущим положением.
pub(crate) fn flush_geometry(app: &AppHandle) {
    let saver = app
        .state::<Runtime>()
        .geometry
        .lock()
        .expect("geometry lock")
        .clone();
    if let Some(saver) = saver
        && let Err(error) = saver.flush()
    {
        log::error!("{error}");
    }
}

/// Возвращает окну геометрию из текущих настроек.
///
/// Тем же путём идёт сброс из настроек: восстановление и сброс должны
/// применять геометрию одинаково, иначе они разойдутся в поведении.
/// `true` — окно пришлось прижать, то есть сохранённая геометрия на этой
/// машине недостижима.
fn restore_geometry(app: &AppHandle, window: &WebviewWindow) -> bool {
    let saved = app
        .state::<Runtime>()
        .settings
        .lock()
        .expect("settings lock")
        .window
        .clone();

    match window::restore(window, &saved) {
        Ok(window::Restored::AsSaved) => false,
        Ok(window::Restored::Adjusted) => true,
        Err(error) => {
            log::error!("Не удалось применить геометрию окна: {error}");
            false
        }
    }
}

/// Подписывает окно на прилипание к краям рабочей области.
///
/// Подписка отдельная и стоит раньше сохранения геометрии: так прилипание
/// работает и без хранилища, а снимок берётся уже с выровненного окна.
fn start_snapping(app: &AppHandle, window: &WebviewWindow) {
    window.on_window_event({
        let app = app.clone();
        let window = window.clone();
        move |event| {
            if matches!(event, WindowEvent::Moved(_)) {
                snap_window(&app, &window);
            }
        }
    });
}

/// Запускает отложенное сохранение геометрии.
///
/// События окна приходят часто, поэтому запись идёт в фоновом потоке
/// с задержкой; при закрытии и выходе она сбрасывается принудительно.
///
/// Подписка обязана идти после `start_snapping`: обработчики зовутся
/// в порядке подписки, и снимок должен брать уже выровненное окно.
fn start_geometry_saver(app: &AppHandle, window: &WebviewWindow) {
    let saver = window::GeometrySaver::spawn({
        let app = app.clone();
        move |patch| save_geometry_patch(&app, patch)
    });

    window.on_window_event({
        let saver = Arc::clone(&saver);
        let window = window.clone();
        move |event| match event {
            // Снимок снимается здесь, в потоке событий окна: геттеры окна
            // отвечает этот же поток, и запрос из фоновой записи повис бы.
            WindowEvent::Resized(_) | WindowEvent::Moved(_) => {
                if let Some(patch) = capture_geometry(&window) {
                    saver.store(patch);
                }
            }
            WindowEvent::CloseRequested { .. } => {
                if let Err(error) = saver.flush() {
                    log::error!("{error}");
                }
            }
            _ => {}
        }
    });

    *app.state::<Runtime>()
        .geometry
        .lock()
        .expect("geometry lock") = Some(saver);
}

/// Прилипание окна к краям рабочей области.
///
/// Отказ только отлаживается: прилипание - удобство, и сбой чтения монитора
/// не должен мешать движению окна или его закрытию.
///
/// Замок состояния отпускается до переноса окна: собственный сдвиг приходит
/// событием `Moved` внутри `set_position`, и захват замка на это время
/// остановил бы приложение.
fn snap_window(app: &AppHandle, window: &WebviewWindow) {
    let target = {
        let runtime = app.state::<Runtime>();
        let mut tracker = runtime.snap.lock().expect("snap lock");
        match window::snap_target(window, &mut tracker) {
            Ok(target) => target,
            Err(error) => {
                log::debug!("Прилипание окна пропущено: {error}");
                return;
            }
        }
    };

    let Some(target) = target else {
        return;
    };

    if let Err(error) = window.set_position(Position::Physical(PhysicalPosition::new(
        target.x, target.y,
    ))) {
        log::debug!("Прилипание окна пропущено: {error}");
    }
}

/// Снимок геометрии окна для записи.
///
/// `None` — писать нечего: свёрнутое окно не имеет осмысленных размера
/// и места. Отказ чтения только отлаживается: геометрия — удобство,
/// а не работа программы, и сбой чтения не должен мешать ни движению окна,
/// ни его закрытию.
fn capture_geometry(window: &WebviewWindow) -> Option<Value> {
    match window::capture(window) {
        Ok(patch) => patch,
        Err(error) => {
            log::debug!("Геометрия окна не прочитана: {error}");
            None
        }
    }
}

/// Снимок геометрии и запись в настройки — немедленно, без таймера.
///
/// Нужен сразу после показа окна, когда сохранённое место оказалось
/// недостижимым: прижатие записывается фактическими числами.
fn save_geometry(app: &AppHandle, window: &WebviewWindow) {
    if let Some(patch) = capture_geometry(window) {
        save_geometry_patch(app, patch);
    }
}

/// Запись раздела `window` в настройки.
///
/// Раздел сохраняется общим путём: проверка типов, неизвестные ключи
/// и событие `core:settings:changed` остаются теми же, что у правок
/// из интерфейса.
fn save_geometry_patch(app: &AppHandle, patch: Value) {
    let runtime = app.state::<Runtime>();
    if let Err(error) = commit_settings(app, &runtime, settings::SECTION_WINDOW, |current| {
        settings::apply_patch(current, settings::SECTION_WINDOW, patch)
    }) {
        log::error!("Геометрия окна не сохранена: {error}");
    }
}

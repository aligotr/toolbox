//! Точка сборки приложения: сервисы ядра + шина + мост в интерфейс.
//!
//! Порядок инициализации строгий (ADR 0005):
//! **storage → settings → logging → bus → sink → modules → bus.start()**.
//! Логирование не может стартовать раньше, чем известно, куда писать,
//! а настройки — раньше, чем известно, где они лежат.

mod core;
mod modules;

use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow, WindowEvent};
use tauri_plugin_opener::OpenerExt;

use core::infra::bus::{BusError, ERROR_TOPIC, MessageBus};
use core::infra::deps::Deps;
use core::infra::sink::EventSink;
use core::services::data;
use core::services::languages;
use core::services::logging::{self, Logger};
use core::services::presets;
use core::services::profiles;
use core::services::settings::{self, Settings};
use core::services::templates;
use core::services::window;
use core::services::workspace;
use core::store;
use core::store::storage::{DEFAULT_PROFILE, Storage};

/// Метка главного окна из `tauri.conf.json`. Через неё окно находится
/// при восстановлении геометрии, сбросе размера и показе после запуска.
const MAIN_WINDOW: &str = "main";

/// Мост событий шины в интерфейс.
///
/// Шина не знает про Tauri: она отдаёт события абстрактному [`EventSink`].
/// Эта реализация просто пересылает каждое событие в UI под его топиком.
struct TauriSink {
    app: AppHandle,
}

impl EventSink for TauriSink {
    fn emit(&self, topic: &'static str, payload: Value) {
        if let Err(error) = self.app.emit(topic, payload) {
            log::error!("Не удалось отправить событие '{topic}' в интерфейс: {error}");
            // Недоставка видна только в логе, поэтому пробуем сообщить о ней
            // ещё и в интерфейс: возможно, не дошло лишь это событие.
            // Отчёт об отказе самого отчёта не порождает: иначе рекурсия.
            if topic != ERROR_TOPIC {
                if let Ok(report) = serde_json::to_value(BusError::new(
                    topic,
                    format!("событие не доставлено в интерфейс: {error}"),
                )) {
                    let _ = self.app.emit(ERROR_TOPIC, report);
                }
            }
        }
    }
}

/// Почему приложение не может начать работу.
///
/// Заголовок у каждого отказа свой: «не могу писать в папку» и «лог не
/// запустился» требуют разных действий, а общий заголовок заставил бы
/// пользователя выискивать различие в тексте причины.
struct StartupError {
    /// Заголовок блокирующего экрана.
    title: &'static str,
    /// Что именно не удалось — с путями и текстом ошибки.
    reason: String,
}

/// Состояние, которое читают команды интерфейса после запуска.
struct Runtime {
    /// `Some` — работать нельзя: модули не запущены, нужен блокирующий экран.
    blocked: Option<StartupError>,
    /// Папка программы.
    root: String,
    /// `None`, если лог не запустился.
    logger: Option<Arc<Logger>>,
    storage: Option<Arc<Storage>>,
    settings: Mutex<Settings>,
    /// Сохранение геометрии окна. `None` до показа окна и при блокировке.
    geometry: Mutex<Option<Arc<window::GeometrySaver>>>,
}

/// Ответ на вопрос интерфейса «можно ли работать и что показывать».
///
/// Отдельная структура, а не голый `bool`: экран блокировки обязан показать
/// путь и причину, иначе пользователю нечего исправлять.
#[derive(Serialize)]
struct StartupStatus {
    blocked: bool,
    /// Заголовок блокирующего экрана; `None`, если запуск удался.
    title: Option<&'static str>,
    root: String,
    reason: Option<String>,
    log_path: String,
    log_level: String,
    /// Язык блокирующего экрана и интерфейса (ADR 0039).
    language: String,
}

/// Язык интерфейса из настроек.
///
/// `None` — «как в системе»: до первого определения интерфейсом ядро
/// работает по-русски, чтобы блокирующий экран не остался без текста.
fn language_of(settings: &Settings) -> String {
    settings
        .ui
        .language
        .clone()
        .unwrap_or_else(|| languages::DEFAULT_CODE.to_owned())
}

/// Собирает приложение в порядке зависимостей.
///
/// Провал проверки записи не роняет процесс: он возвращает заблокированное
/// состояние, а интерфейс показывает экран блокировки (ADR 0005).
fn boot(app: &AppHandle) -> Runtime {
    // 1. Портативный корень — папка программы. Отката в системные каталоги нет.
    let storage = match Storage::detect() {
        Ok(storage) => storage,
        Err(reason) => {
            return blocked(
                app,
                "неизвестна",
                languages::DEFAULT_CODE,
                "Не удалось определить папку программы",
                reason,
            );
        }
    };
    let root = storage.root().display().to_string();

    // 2. Настройки. Замечания пока некуда записать: лог ещё не запущен.
    // Читаются до пробы, потому что активный профиль определяет, какую папку
    // проверять на запись.
    let mut loaded = settings::load(&storage.settings_path());
    // Язык нужен блокирующему экрану: интерфейс ещё не читал настройки.
    let language = language_of(&loaded.settings);
    let configured = loaded.settings.active_profile.clone();
    let active = match profiles::list(&storage.profiles_dir()) {
        // Папки профилей нет или она пуста: восстанавливать нечего.
        // Активным становится профиль по умолчанию — его и создаст
        // `ensure_default`. Оставленное в настройках имя указывало бы
        // на папку, которой нет.
        Ok(items) if items.is_empty() => DEFAULT_PROFILE.to_owned(),
        Ok(items) => match items.iter().find(|profile| profile.id == configured) {
            Some(_) => configured.clone(),
            None => {
                // Настройки пришли с другой машины, профиль удалили вручную
                // или синхронизация не донесла папку. Молча создать пустую
                // папку с тем же именем значило бы показать пустое приложение
                // вместо данных, которые лежат рядом.
                let fallback = items
                    .iter()
                    .find(|profile| profile.id == DEFAULT_PROFILE)
                    .unwrap_or(&items[0])
                    .clone();
                loaded.warnings.push(format!(
                    "активный профиль '{}' не найден среди папок '{}'; выбран '{}'",
                    configured,
                    storage.profiles_dir().display(),
                    fallback.id
                ));
                fallback.id
            }
        },
        Err(reason) => {
            // Список не прочитан: причину покажет проба записи, а профиль
            // остаётся тем, что записан в настройках.
            loaded.warnings.push(reason);
            configured.clone()
        }
    };

    let storage = storage.with_profile(active.as_str());

    // Профиль по умолчанию создаётся до пробы: проба создаёт папку активного
    // профиля пустой, и после неё отличить первый запуск от готового профиля
    // без названия было бы нельзя.
    if let Err(reason) = profiles::ensure_default(&storage.profiles_dir()) {
        return blocked(
            app,
            &root,
            &language,
            "Не могу писать в папку программы",
            reason,
        );
    }

    // Проверка записи делом — до всего остального.
    if let Err(reason) = storage.probe() {
        return blocked(
            app,
            &root,
            &language,
            "Не могу писать в папку программы",
            reason,
        );
    }
    let storage = Arc::new(storage);

    // 3. Логирование: с этого момента отказы оставляют след.
    let logger = match logging::init(storage.logs_dir(), loaded.settings.log.level) {
        Ok(logger) => logger,
        Err(reason) => {
            return blocked(
                app,
                &root,
                &language,
                "Не удалось запустить файловый лог",
                reason,
            );
        }
    };
    logging::install_panic_hook(logger.clone());

    // Английский словарь ставится один раз: дальше пользователь правит его сам.
    if let Err(reason) = languages::seed(&storage.languages_dir()) {
        log::warn!("Словари интерфейса не подготовлены: {reason}");
    }

    log::info!(
        "ToolBox {}: запуск, режим {}, папка программы '{root}'",
        env!("CARGO_PKG_VERSION"),
        if cfg!(debug_assertions) {
            "dev"
        } else {
            "release"
        }
    );
    log::info!("Применён уровень лога '{}'", loaded.settings.log.level);
    log::info!(
        "Настройки '{}', рабочее пространство '{}'",
        storage.settings_path().display(),
        storage.workspace_path().display()
    );
    log::info!("Лог '{}'", logger.path().display());
    log::info!(
        "Профили '{}', активный профиль '{}'",
        storage.profiles_dir().display(),
        storage.active_profile_dir().display()
    );
    for warning in &loaded.warnings {
        log::warn!("{warning}");
    }

    // Согласование могло заменить активный профиль. Файл обязан совпадать
    // с тем, с которым работаем: иначе следующий запуск снова станет искать
    // несуществующую папку.
    if loaded.settings.active_profile != active {
        loaded.settings.active_profile = active;
        if let Err(error) = settings::save(&storage.settings_path(), &loaded.settings) {
            log::error!("Активный профиль не сохранён: {error}");
        }
    }

    // Файл настроек создаём сразу: иначе непонятно, что и где править.
    // Отказ записи — провал приложения, а не замечание: настройки больше
    // негде взять, и пользователь должен найти причину в логе.
    if !storage.settings_path().exists() {
        if let Err(error) = settings::save(&storage.settings_path(), &loaded.settings) {
            log::error!("{error}");
        }
    }

    // 4. Зависимости: обработчики получают их через `Deps`.
    let deps = Deps::new();
    deps.add(app.clone());
    deps.add(storage.clone());

    // 5. Шина и её выход в интерфейс.
    let bus = MessageBus::new(deps);
    bus.set_sink(Arc::new(TauriSink { app: app.clone() }));

    // 6. Подсистемы регистрируются до запуска диспетчера.
    modules::register_all(&bus);
    bus.start();
    app.manage(bus);

    log::info!("Запуск завершён");

    Runtime {
        blocked: None,
        root,
        logger: Some(logger),
        storage: Some(storage),
        settings: Mutex::new(loaded.settings),
        geometry: Mutex::new(None),
    }
}

/// Заблокированное состояние: причину показываем, модули не запускаем.
///
/// Шина всё равно публикуется — пустая и незапущенная. Иначе команды моста
/// падали бы на отсутствующем состоянии вместо внятного отказа.
fn blocked(
    app: &AppHandle,
    root: &str,
    language: &str,
    title: &'static str,
    reason: String,
) -> Runtime {
    app.manage(MessageBus::new(Deps::new()));

    // Язык нужен блокирующему экрану: настройки интерфейс ещё не читал.
    let mut settings = Settings::default();
    settings.ui.language = Some(language.to_owned());

    Runtime {
        blocked: Some(StartupError { title, reason }),
        root: root.to_owned(),
        logger: None,
        storage: None,
        settings: Mutex::new(settings),
        geometry: Mutex::new(None),
    }
}

// ─────────────────────────────── Команды моста ───────────────────────────────

/// Публикация события из интерфейса («выстрелил и забыл»).
#[tauri::command]
fn send_event(bus: State<'_, MessageBus>, topic: String, payload: Value) -> Result<(), String> {
    log::debug!("IPC send_event: '{topic}'");
    bus.dispatch_event(&topic, payload)
}

/// Синхронная команда из интерфейса. Ошибка вернётся в UI как отклонённый вызов.
#[tauri::command]
fn invoke_command(bus: State<'_, MessageBus>, topic: String, payload: Value) -> Result<(), String> {
    log::debug!("IPC invoke_command: '{topic}'");
    bus.dispatch_command(&topic, payload)
}

/// Запрос/ответ из интерфейса: шина ждёт событие с тем же `correlation_id`.
#[tauri::command]
fn ask(
    bus: State<'_, MessageBus>,
    topic: String,
    reply_topic: String,
    payload: Value,
    timeout_ms: Option<u64>,
) -> Result<Value, String> {
    log::debug!("IPC ask: '{topic}' → '{reply_topic}'");
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(5000));
    bus.ask(&topic, &reply_topic, payload, timeout)
}

/// Учебный прогон: тот же `ask`, но ядро записывает цепочку и присылает
/// её событием `core:trace`. Обычные запросы ничего не трассируют.
#[tauri::command]
fn ask_traced(
    bus: State<'_, MessageBus>,
    topic: String,
    reply_topic: String,
    payload: Value,
    timeout_ms: Option<u64>,
) -> Result<Value, String> {
    log::debug!("IPC ask_traced: '{topic}' → '{reply_topic}'");
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(5000));
    bus.ask_traced(&topic, &reply_topic, payload, timeout)
}

// ─────────────────────────────── Команды сервисов ────────────────────────────

/// Хранилище или внятный отказ.
///
/// При блокировке запуска хранилища нет вовсе; без этой проверки каждая
/// команда повторяла бы один и тот же разбор `Option`.
fn storage_of(runtime: &Runtime) -> Result<&Storage, String> {
    runtime
        .storage
        .as_deref()
        .ok_or_else(|| "Хранилище не запущено".to_owned())
}

/// Состояние запуска: экран блокировки и подпись к файлу лога.
#[tauri::command]
fn startup_status(runtime: State<'_, Runtime>) -> StartupStatus {
    let settings = runtime.settings.lock().expect("settings lock");
    StartupStatus {
        blocked: runtime.blocked.is_some(),
        title: runtime.blocked.as_ref().map(|error| error.title),
        root: runtime.root.clone(),
        reason: runtime.blocked.as_ref().map(|error| error.reason.clone()),
        log_path: runtime
            .logger
            .as_ref()
            .map(|logger| logger.path().display().to_string())
            .unwrap_or_default(),
        log_level: settings.log.level.to_string(),
        language: language_of(&settings),
    }
}

/// Текущие настройки целиком: интерфейс читает их при открытии экранов.
#[tauri::command]
fn settings_get(runtime: State<'_, Runtime>) -> Settings {
    runtime.settings.lock().expect("settings lock").clone()
}

/// Частичное обновление: меняется только названный раздел.
///
/// Раздел присылается отдельно, а не всем документом: две панели, сохраняющие
/// одновременно, иначе затирали бы правки друг друга.
#[tauri::command]
fn settings_set(
    app: AppHandle,
    runtime: State<'_, Runtime>,
    section: String,
    value: Value,
) -> Result<Settings, String> {
    let updated = commit_settings(&app, &runtime, &section, |current| {
        settings::apply_patch(current, &section, value)
    })?;
    log::debug!("Настройки обновлены: раздел '{section}'");
    Ok(updated)
}

/// Сбрасывает геометрию окна: остальные разделы не трогаются.
#[tauri::command]
fn window_reset(app: AppHandle, runtime: State<'_, Runtime>) -> Result<Settings, String> {
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

/// Применяет изменение настроек, сохраняет файл и сообщает интерфейсу.
///
/// Правило «сначала запись, потом память» живёт в `settings::commit`.
/// Здесь остаются побочные эффекты: логгер и событие интерфейсу.
fn commit_settings(
    app: &AppHandle,
    runtime: &Runtime,
    section: &str,
    change: impl FnOnce(&Settings) -> Result<Settings, String>,
) -> Result<Settings, String> {
    let Some(storage) = runtime.storage.as_ref() else {
        return Err("Хранилище не запущено".to_owned());
    };

    let mut guard = runtime.settings.lock().expect("settings lock");
    let committed = settings::commit(&storage.settings_path(), &mut guard, change)?;
    drop(guard);

    if committed.log_level_changed {
        if let Some(logger) = runtime.logger.as_ref() {
            logger.set_level(committed.settings.log.level);
        }
    }

    emit_settings_changed(app, section);
    Ok(committed.settings)
}

/// Сообщение «настройки изменились» с именем раздела.
///
/// Недоставка не отменяет сохранение: файл уже записан, и интерфейс может
/// перечитать настройки вручную. Поэтому отказ только логируется.
fn emit_settings_changed(app: &AppHandle, section: &str) {
    #[derive(Clone, Serialize)]
    struct Changed<'a> {
        section: &'a str,
    }

    if let Err(error) = app.emit(settings::CHANGED_TOPIC, Changed { section }) {
        log::error!(
            "Не удалось отправить '{}' в интерфейс: {error}",
            settings::CHANGED_TOPIC
        );
    }
}

// ─────────────────────────── Рабочее пространство ────────────────────────────

/// Читает рабочее пространство для интерфейса.
///
/// `null` — файла ещё нет: первый запуск, вкладку создаст оболочка.
/// Остальные отказы возвращаются текстом: интерфейс запишет причину
/// в журнал и начнёт с одной пустой вкладки.
#[tauri::command]
fn workspace_load(runtime: State<'_, Runtime>) -> Result<Option<Value>, String> {
    let storage = storage_of(&runtime)?;
    workspace::load(&storage.workspace_path())
}

/// Сохраняет рабочее пространство.
///
/// Содержимое непрозрачно: ядро проверяет только «это объект». Формат
/// принадлежит интерфейсу, поэтому правка раскладки не требует правки Rust.
#[tauri::command]
fn workspace_save(runtime: State<'_, Runtime>, data: Value) -> Result<(), String> {
    let storage = storage_of(&runtime)?;
    workspace::save(&storage.workspace_path(), &data)?;
    log::debug!("Рабочее пространство сохранено");
    Ok(())
}

// ─────────────────────────────── Профили ─────────────────────────────────────

/// Список профилей вместе с активным.
///
/// Активный отдаётся здесь же: интерфейсу он нужен всегда вместе со списком,
/// а два отдельных вызова могли бы разойтись между собой.
#[tauri::command]
fn profiles_list(runtime: State<'_, Runtime>) -> Result<profiles::ProfileList, String> {
    let storage = storage_of(&runtime)?;
    Ok(profiles::ProfileList {
        active: runtime
            .settings
            .lock()
            .expect("settings lock")
            .active_profile
            .clone(),
        items: profiles::list(&storage.profiles_dir())?,
    })
}

/// Создаёт профиль из названия: папка получает латинский идентификатор.
#[tauri::command]
fn profile_create(runtime: State<'_, Runtime>, title: String) -> Result<profiles::Profile, String> {
    let storage = storage_of(&runtime)?;
    let profile = profiles::create(&storage.profiles_dir(), &title)?;
    log::info!("Создан профиль '{}' ({})", profile.title, profile.id);
    Ok(profile)
}

/// Переименовывает профиль: меняется название, папка остаётся на месте.
#[tauri::command]
fn profile_rename(
    runtime: State<'_, Runtime>,
    id: String,
    title: String,
) -> Result<profiles::Profile, String> {
    let storage = storage_of(&runtime)?;
    let profile = profiles::rename(&storage.profiles_dir(), &id, &title)?;
    log::info!("Профиль '{id}' переименован в '{}'", profile.title);
    Ok(profile)
}

/// Удаляет профиль в корзину `local/trash/`.
///
/// Активный профиль удалить нельзя: его папка открыта прямо сейчас, и данные
/// исчезли бы из-под работающего приложения. Сначала переключение.
#[tauri::command]
fn profile_delete(runtime: State<'_, Runtime>, id: String) -> Result<String, String> {
    let storage = storage_of(&runtime)?;
    let active = runtime
        .settings
        .lock()
        .expect("settings lock")
        .active_profile
        .clone();
    if id == active {
        return Err("Нельзя удалить активный профиль: сначала переключитесь на другой".to_owned());
    }

    let target = profiles::delete(&storage.profiles_dir(), &storage.trash_dir(), &id)?;
    log::info!("Профиль '{id}' перемещён в '{}'", target.display());
    Ok(target.display().to_string())
}

/// Делает профиль активным.
///
/// Применяется при следующем запуске: сервисы читают папку профиля один раз
/// при старте, и подмена её на ходу оставила бы открытыми файлы прежнего.
/// Перезапуск — отдельная команда, чтобы интерфейс успел сбросить
/// рабочее пространство и показать отказ, если запись настроек не удалась.
#[tauri::command]
fn profile_switch(
    app: AppHandle,
    runtime: State<'_, Runtime>,
    id: String,
) -> Result<Settings, String> {
    let storage = storage_of(&runtime)?;
    profiles::validate_id(&id)?;
    if !storage.profiles_dir().join(&id).is_dir() {
        return Err(format!("Профиль '{id}' не найден"));
    }

    let updated = commit_settings(&app, &runtime, settings::SECTION_PROFILE, |current| {
        settings::apply_patch(
            current,
            settings::SECTION_PROFILE,
            Value::String(id.clone()),
        )
    })?;
    log::info!("Активный профиль переключён на '{id}'");
    Ok(updated)
}

/// Перезапускает приложение.
///
/// `request_restart`, а не `restart`: выход обязан пройти общий путь
/// `RunEvent::Exit`, где дописываются геометрия окна и файл лога.
#[tauri::command]
fn app_restart(app: AppHandle) {
    log::info!("Перезапуск по запросу интерфейса");
    app.request_restart();
}

// ─────────────────────────────── Шаблоны ─────────────────────────────────────

/// Список шаблонов активного профиля.
///
/// Замечания о непрочитанных файлах идут вместе со списком: испорченный
/// шаблон не мешает остальным, но пользователь должен знать, что он был.
#[tauri::command]
fn templates_list(runtime: State<'_, Runtime>) -> Result<templates::TemplateList, String> {
    let storage = storage_of(&runtime)?;
    templates::list(&storage.templates_dir())
}

/// Сохраняет геометрию вкладки шаблоном.
#[tauri::command]
fn template_create(
    runtime: State<'_, Runtime>,
    title: String,
    layout: Value,
) -> Result<templates::Template, String> {
    let storage = storage_of(&runtime)?;
    let template = templates::create(&storage.templates_dir(), &title, layout)?;
    log::info!("Создан шаблон '{}' ({})", template.title, template.id);
    Ok(template)
}

/// Обновляет геометрию шаблона из вкладки.
///
/// Название не меняется: переименование — отдельная команда и отдельный
/// пункт меню, чтобы обновление раскладки не переписывало название.
#[tauri::command]
fn template_update(
    runtime: State<'_, Runtime>,
    id: String,
    layout: Value,
) -> Result<templates::Template, String> {
    let storage = storage_of(&runtime)?;
    let template = templates::update(&storage.templates_dir(), &id, layout)?;
    log::info!("Шаблон '{}' обновлён из вкладки", template.title);
    Ok(template)
}

/// Переименовывает шаблон: файл остаётся на месте.
#[tauri::command]
fn template_rename(
    runtime: State<'_, Runtime>,
    id: String,
    title: String,
) -> Result<templates::Template, String> {
    let storage = storage_of(&runtime)?;
    let template = templates::rename(&storage.templates_dir(), &id, &title)?;
    log::info!("Шаблон '{id}' переименован в '{}'", template.title);
    Ok(template)
}

/// Дублирует шаблон; без названия копия получает приписку «(копия)».
#[tauri::command]
fn template_duplicate(
    runtime: State<'_, Runtime>,
    id: String,
    title: Option<String>,
) -> Result<templates::Template, String> {
    let storage = storage_of(&runtime)?;
    let template = templates::duplicate(&storage.templates_dir(), &id, title.as_deref())?;
    log::info!("Шаблон '{id}' дублирован как '{}'", template.id);
    Ok(template)
}

/// Удаляет шаблон в `local/trash/templates/`.
#[tauri::command]
fn template_delete(runtime: State<'_, Runtime>, id: String) -> Result<String, String> {
    let storage = storage_of(&runtime)?;
    let target = templates::delete(
        &storage.templates_dir(),
        &storage.templates_trash_dir(),
        &id,
    )?;
    log::info!("Шаблон '{id}' перемещён в '{}'", target.display());
    Ok(target.display().to_string())
}

// ─────────────────────────────── Пресеты ─────────────────────────────────────

/// Список пресетов инструмента в активном профиле.
///
/// Замечания о непрочитанных файлах идут вместе со списком: испорченный
/// пресет не мешает остальным, но пользователь должен знать, что он был.
#[tauri::command]
fn presets_list(runtime: State<'_, Runtime>, tool: String) -> Result<presets::PresetList, String> {
    let storage = storage_of(&runtime)?;
    presets::list(&storage.presets_dir(), &tool)
}

/// Пресет по умолчанию для инструмента активного профиля.
///
/// `id = null` — умолчание не задано: новая вкладка открывается пустой, как и
/// раньше. Указатель лежит в `profile.json`, поэтому виден только активному
/// профилю и синхронизируется вместе с ним.
#[tauri::command]
fn preset_default_get(
    runtime: State<'_, Runtime>,
    tool: String,
) -> Result<presets::PresetDefault, String> {
    let storage = storage_of(&runtime)?;
    presets::default_for(&storage.active_profile_dir(), &tool)
}

/// Назначает или снимает пресет по умолчанию.
///
/// Существование пресета проверяет домен пресетов: указатель в пустоту
/// открывал бы вкладку с предупреждением на каждом запуске.
#[tauri::command]
fn preset_default_set(
    runtime: State<'_, Runtime>,
    tool: String,
    id: Option<String>,
) -> Result<Option<String>, String> {
    let storage = storage_of(&runtime)?;
    let assigned = presets::set_default(
        &storage.active_profile_dir(),
        &storage.presets_dir(),
        &tool,
        id.as_deref(),
    )?;

    log::info!(
        "Пресет по умолчанию для '{tool}': {}",
        assigned.as_deref().unwrap_or("не задан")
    );
    Ok(assigned)
}

/// Сохраняет текущие настройки инструмента новым пресетом.
#[tauri::command]
fn preset_create(
    runtime: State<'_, Runtime>,
    tool: String,
    title: String,
    payload: Value,
) -> Result<presets::Preset, String> {
    let storage = storage_of(&runtime)?;
    let preset = presets::create(&storage.presets_dir(), &tool, &title, payload)?;
    Ok(preset)
}

/// Заменяет настройки пресета; название остаётся прежним.
#[tauri::command]
fn preset_update(
    runtime: State<'_, Runtime>,
    tool: String,
    id: String,
    payload: Value,
) -> Result<presets::Preset, String> {
    let storage = storage_of(&runtime)?;
    let preset = presets::update(&storage.presets_dir(), &tool, &id, payload)?;
    Ok(preset)
}

/// Переименовывает пресет: файл остаётся на месте.
#[tauri::command]
fn preset_rename(
    runtime: State<'_, Runtime>,
    tool: String,
    id: String,
    title: String,
) -> Result<presets::Preset, String> {
    let storage = storage_of(&runtime)?;
    let preset = presets::rename(&storage.presets_dir(), &tool, &id, &title)?;
    Ok(preset)
}

/// Дублирует пресет; без названия копия получает приписку «(копия)».
#[tauri::command]
fn preset_duplicate(
    runtime: State<'_, Runtime>,
    tool: String,
    id: String,
    title: Option<String>,
) -> Result<presets::Preset, String> {
    let storage = storage_of(&runtime)?;
    let preset = presets::duplicate(&storage.presets_dir(), &tool, &id, title.as_deref())?;
    Ok(preset)
}

/// Удаляет пресет в `local/trash/presets/<tool>/`.
#[tauri::command]
fn preset_delete(runtime: State<'_, Runtime>, tool: String, id: String) -> Result<String, String> {
    let storage = storage_of(&runtime)?;
    let target = presets::delete(
        &storage.presets_dir(),
        &storage.presets_trash_dir(),
        &storage.active_profile_dir(),
        &tool,
        &id,
    )?;
    Ok(target.display().to_string())
}

// ─────────────────────────────── Словари ─────────────────────────────────────

/// Список словарей интерфейса из `local/languages/`.
///
/// Отсутствие папки или файлов — норма: остаётся встроенный русский.
#[tauri::command]
fn languages_list(runtime: State<'_, Runtime>) -> Result<Vec<languages::LanguageSummary>, String> {
    let storage = storage_of(&runtime)?;
    languages::list(&storage.languages_dir())
}

/// Читает внешний словарь: интерфейс получает готовый объект.
///
/// Разбор — на стороне Rust: один диалект JSONC на обе стороны, а ошибка
/// приходит с номером строки.
#[tauri::command]
fn language_load(runtime: State<'_, Runtime>, code: String) -> Result<languages::Language, String> {
    let storage = storage_of(&runtime)?;
    languages::load(&storage.languages_dir(), &code)
}

/// Выгружает образец словаря; существующий файл не перезаписывается.
#[tauri::command]
fn language_export(
    runtime: State<'_, Runtime>,
    code: String,
    document: Value,
) -> Result<String, String> {
    let storage = storage_of(&runtime)?;
    let path = languages::export(&storage.languages_dir(), &code, &document)?;
    Ok(path.display().to_string())
}

// ─────────────────────────── Сведения и данные ───────────────────────────────

/// Сведения о программе для раздела «Программа» и «Журнал».
///
/// Одна команда на всё: версия, режим сборки, папки, активный профиль
/// и срок хранения лога. По отдельным вызовам экран мигал бы полями,
/// а подписи «14 дней» в интерфейсе пришлось бы держать в двух местах.
#[derive(Serialize)]
struct AppInfo {
    version: String,
    /// `true` — отладочная сборка (`cargo run`, `tauri dev`).
    debug: bool,
    root: String,
    /// Идентификатор активного профиля.
    profile: String,
    /// Название активного профиля; без `profile.json` совпадает с id.
    profile_title: String,
    /// Файл лога текущих суток; пусто, если лог не запущен.
    log_path: String,
    /// Папка логов: её открывает кнопка раздела «Журнал».
    log_dir: String,
    log_keep_days: i64,
}

#[tauri::command]
fn app_info(app: AppHandle, runtime: State<'_, Runtime>) -> AppInfo {
    let settings = runtime.settings.lock().expect("settings lock");
    let storage = runtime.storage.as_deref();

    let profile_title = storage
        .and_then(|storage| profiles::list(&storage.profiles_dir()).ok())
        .and_then(|items| {
            items
                .into_iter()
                .find(|profile| profile.id == settings.active_profile)
        })
        .map(|profile| profile.title)
        .unwrap_or_else(|| settings.active_profile.clone());

    AppInfo {
        version: app.package_info().version.to_string(),
        debug: cfg!(debug_assertions),
        root: runtime.root.clone(),
        profile: settings.active_profile.clone(),
        profile_title,
        log_path: runtime
            .logger
            .as_ref()
            .map(|logger| logger.path().display().to_string())
            .unwrap_or_default(),
        log_dir: storage
            .map(|storage| storage.logs_dir().display().to_string())
            .unwrap_or_default(),
        log_keep_days: logging::KEEP_DAYS,
    }
}

/// Размеры логов, шаблонов и данных инструментов активного профиля.
#[tauri::command]
fn storage_stats(runtime: State<'_, Runtime>) -> Result<store::stats::StorageStats, String> {
    let storage = storage_of(&runtime)?;
    Ok(store::stats::summary(&storage))
}

/// Удаляет файлы лога старше срока хранения и возвращает их число.
///
/// Срок задан ядром, а не интерфейсом: иначе кнопка говорила бы «старше
/// 14 дней», а удаляла бы другой промежуток.
#[tauri::command]
fn logs_prune(runtime: State<'_, Runtime>) -> Result<usize, String> {
    let storage = storage_of(&runtime)?;
    let removed = logging::prune_older(&storage.logs_dir());
    log::info!("Удалено старых файлов лога: {removed}");
    Ok(removed)
}

/// Переносит данные инструмента в `local/trash/data/`.
#[tauri::command]
fn tool_data_clear(runtime: State<'_, Runtime>, tool: String) -> Result<String, String> {
    let storage = storage_of(&runtime)?;
    let target = data::clear_tool(
        &storage.active_profile_dir(),
        &storage.data_trash_dir(),
        &tool,
    )?;
    log::info!(
        "Данные инструмента '{tool}' перемещены в '{}'",
        target.display()
    );
    Ok(target.display().to_string())
}

/// Открывает папку программы или логов в проводнике.
///
/// Путь выбирает ядро по имени, а не интерфейс: иначе окно могло бы
/// попросить открыть любой каталог на диске.
#[tauri::command]
fn open_folder(app: AppHandle, runtime: State<'_, Runtime>, kind: String) -> Result<(), String> {
    let storage = storage_of(&runtime)?;
    let path = match kind.as_str() {
        "logs" => storage.logs_dir(),
        "languages" => storage.languages_dir(),
        "root" => storage.root().to_path_buf(),
        other => return Err(format!("Неизвестная папка: '{other}'")),
    };

    app.opener()
        .open_path(path.display().to_string(), None::<&str>)
        .map_err(|error| format!("Не удалось открыть '{}': {error}", path.display()))
}

// ─────────────────────────────── Окно ────────────────────────────────────────

/// Показывает главное окно с сохранённой геометрией.
///
/// Окно создаётся скрытым (`visible: false`): восстановление размера и места
/// происходит до `show()`, поэтому скачка из системного угла не видно.
fn show_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        log::error!("Главное окно '{MAIN_WINDOW}' не найдено: показ и геометрия пропущены");
        return;
    };

    let adjusted = restore_geometry(app, &window);

    if let Err(error) = window.show() {
        log::error!("Не удалось показать главное окно: {error}");
    }

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

/// Запускает отложенное сохранение геометрии.
///
/// События окна приходят часто, поэтому запись идёт в фоновом потоке
/// с задержкой; при закрытии и выходе она сбрасывается принудительно.
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

/// Запись в лог из интерфейса. Нужна для ошибок JS и необработанных отказов:
/// иначе они не оставляют следа вообще (ADR 0004).
///
/// Уровень не принимается параметром: перечень того, что пишет интерфейс,
/// закрыт и состоит только из ошибок. Лишний параметр рано или поздно
/// превратился бы в информационные сообщения из UI.
#[tauri::command]
fn log_frontend(message: String) -> Result<(), String> {
    log::error!("интерфейс: {message}");
    Ok(())
}

/// Выход без шины: нужен блокирующему экрану, когда модули не запущены.
#[tauri::command]
fn exit_app(app: AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let runtime = boot(app.handle());
            app.manage(runtime);
            show_main_window(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            send_event,
            invoke_command,
            ask,
            ask_traced,
            startup_status,
            settings_get,
            settings_set,
            window_reset,
            workspace_load,
            workspace_save,
            profiles_list,
            profile_create,
            profile_rename,
            profile_delete,
            profile_switch,
            app_restart,
            templates_list,
            template_create,
            template_update,
            template_rename,
            template_duplicate,
            template_delete,
            presets_list,
            preset_default_get,
            preset_default_set,
            preset_create,
            preset_update,
            preset_rename,
            preset_duplicate,
            preset_delete,
            languages_list,
            language_load,
            language_export,
            app_info,
            storage_stats,
            logs_prune,
            tool_data_clear,
            open_folder,
            log_frontend,
            exit_app
        ])
        .build(tauri::generate_context!())
        .expect("ошибка при построении приложения Tauri");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            // Корректное завершение: дождаться обработки очереди событий.
            // `stop()` вызывается в потоке ОС, а не в диспетчере — дедлока нет.
            app_handle.state::<MessageBus>().stop();

            // Последнее движение окна может ещё ждать таймера. Без сброса
            // оно пропадёт: файл останется с предыдущим положением.
            let saver = app_handle
                .state::<Runtime>()
                .geometry
                .lock()
                .expect("geometry lock")
                .clone();
            if let Some(saver) = saver {
                if let Err(error) = saver.flush() {
                    log::error!("{error}");
                }
            }

            log::info!("Шина остановлена, выход");
            log::logger().flush();
        }
    });
}

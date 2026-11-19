//! Сведения о программе, файлы лога и папки.
//!
//! Здесь ответы на вопросы экранов «Программа» и «Журнал»: версия, режим
//! сборки, пути, активный профиль, срок хранения лога. Одна команда на экран:
//! по отдельным вызовам поля мигали бы, а подписи вроде «14 дней» пришлось бы
//! держать в двух местах.

use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::core::infra::error::{AppError, AppResult};
use crate::core::runtime::Runtime;
use crate::core::services::logging;
use crate::core::services::profiles;

/// Ответ на вопрос интерфейса «можно ли работать и что показывать».
///
/// Отдельная структура, а не голый `bool`: экран блокировки обязан показать
/// путь и причину, иначе пользователю нечего исправлять.
#[derive(Serialize)]
pub(crate) struct StartupStatus {
    blocked: bool,
    /// Код заголовка блокирующего экрана; `None`, если запуск удался.
    title: Option<&'static str>,
    root: String,
    reason: Option<AppError>,
    log_path: String,
    log_level: String,
    /// Язык блокирующего экрана и интерфейса (ADR 0039).
    language: String,
}

/// Сведения о программе для раздела «Программа» и «Журнал».
#[derive(Serialize)]
pub(crate) struct AppInfo {
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

/// Состояние запуска: экран блокировки и подпись к файлу лога.
#[tauri::command]
pub(crate) fn startup_status(runtime: State<'_, Runtime>) -> StartupStatus {
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
        language: settings.language(),
    }
}

/// Версия, режим, папки, активный профиль и срок хранения лога.
#[tauri::command]
pub(crate) fn app_info(app: AppHandle, runtime: State<'_, Runtime>) -> AppInfo {
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

/// Удаляет файлы лога старше срока хранения и возвращает их число.
///
/// Срок задан ядром, а не интерфейсом: иначе кнопка говорила бы «старше
/// 14 дней», а удаляла бы другой промежуток.
#[tauri::command]
pub(crate) fn logs_prune(runtime: State<'_, Runtime>) -> AppResult<usize> {
    let storage = runtime.require_storage()?;
    let removed = logging::prune_older(&storage.logs_dir());
    log::info!("Удалено старых файлов лога: {removed}");
    Ok(removed)
}

/// Открывает папку программы, профилей, логов или словарей в проводнике.
///
/// Путь выбирает ядро по имени, а не интерфейс: иначе окно могло бы
/// попросить открыть любой каталог на диске.
#[tauri::command]
pub(crate) fn open_folder(
    app: AppHandle,
    runtime: State<'_, Runtime>,
    kind: String,
) -> AppResult<()> {
    let storage = runtime.require_storage()?;
    let path = match kind.as_str() {
        "logs" => storage.logs_dir(),
        "languages" => storage.languages_dir(),
        "profiles" => storage.profiles_dir(),
        "root" => storage.root().to_path_buf(),
        other => {
            return Err(AppError::new(
                "errors.core.folder",
                format!("Неизвестная папка: '{other}'"),
            )
            .with("folder", other));
        }
    };

    app.opener()
        .open_path(path.display().to_string(), None::<&str>)
        .map_err(|error| {
            AppError::new(
                "errors.core.openFolder",
                format!("Не удалось открыть '{}': {error}", path.display()),
            )
            .with("path", path.display())
            .with("reason", error)
        })
}

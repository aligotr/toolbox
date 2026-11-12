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
use tauri::{AppHandle, Emitter, Manager, State};

use core::bus::{BusError, MessageBus, ERROR_TOPIC};
use core::deps::Deps;
use core::logging::{self, LogLevel, Logger};
use core::settings::{self, Settings};
use core::sink::EventSink;
use core::storage::Storage;

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

/// Состояние, которое читают команды интерфейса после запуска.
struct Runtime {
    /// `Some` — писать некуда: модули не запущены, нужен блокирующий экран.
    blocked: Option<String>,
    /// Папка программы.
    root: String,
    /// `None`, если лог не запустился.
    logger: Option<Arc<Logger>>,
    storage: Option<Arc<Storage>>,
    settings: Mutex<Settings>,
}

/// Ответ на вопрос интерфейса «можно ли работать и что показывать».
///
/// Отдельная структура, а не голый `bool`: экран блокировки обязан показать
/// путь и причину, иначе пользователю нечего исправлять.
#[derive(Serialize)]
struct StartupStatus {
    blocked: bool,
    root: String,
    reason: Option<String>,
    log_path: String,
    log_level: String,
}

/// Собирает приложение в порядке зависимостей.
///
/// Провал проверки записи не роняет процесс: он возвращает заблокированное
/// состояние, а интерфейс показывает экран блокировки (ADR 0005).
fn boot(app: &AppHandle) -> Runtime {
    // 1. Портативный корень — папка программы. Отката в системные каталоги нет.
    let storage = match Storage::detect() {
        Ok(storage) => storage,
        Err(reason) => return blocked(app, "неизвестна", reason),
    };
    let root = storage.root().display().to_string();

    // Проверка записи делом — до всего остального.
    if let Err(reason) = storage.probe() {
        return blocked(app, &root, reason);
    }
    let storage = Arc::new(storage);

    // 2. Настройки. Замечания пока некуда записать: лог ещё не запущен.
    let loaded = settings::load(&storage.settings_path());

    // 3. Логирование: с этого момента отказы оставляют след.
    let logger = match logging::init(storage.logs_dir(), loaded.settings.log_level) {
        Ok(logger) => logger,
        Err(reason) => return blocked(app, &root, reason),
    };
    logging::install_panic_hook(logger.clone());

    log::info!(
        "ToolBox {}: запуск, режим {}, папка программы '{root}', лог '{}'",
        env!("CARGO_PKG_VERSION"),
        if cfg!(debug_assertions) { "dev" } else { "release" },
        logger.path().display()
    );
    log::info!("Применён уровень лога '{}'", loaded.settings.log_level);
    for warning in &loaded.warnings {
        log::warn!("{warning}");
    }

    // Файл настроек создаём сразу: иначе непонятно, что и где править.
    if !storage.settings_path().exists() {
        if let Err(error) = settings::save(&storage.settings_path(), &loaded.settings) {
            log::warn!("{error}");
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
    }
}

/// Заблокированное состояние: причину показываем, модули не запускаем.
///
/// Шина всё равно публикуется — пустая и незапущенная. Иначе команды моста
/// падали бы на отсутствующем состоянии вместо внятного отказа.
fn blocked(app: &AppHandle, root: &str, reason: String) -> Runtime {
    app.manage(MessageBus::new(Deps::new()));
    Runtime {
        blocked: Some(reason),
        root: root.to_owned(),
        logger: None,
        storage: None,
        settings: Mutex::new(Settings::default()),
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

/// Состояние запуска: экран блокировки и подпись к файлу лога.
#[tauri::command]
fn startup_status(runtime: State<'_, Runtime>) -> StartupStatus {
    let settings = runtime.settings.lock().expect("settings lock");
    StartupStatus {
        blocked: runtime.blocked.is_some(),
        root: runtime.root.clone(),
        reason: runtime.blocked.clone(),
        log_path: runtime
            .logger
            .as_ref()
            .map(|logger| logger.path().display().to_string())
            .unwrap_or_default(),
        log_level: settings.log_level.to_string(),
    }
}

/// Меняет уровень лога без перезапуска и сохраняет его в настройках.
#[tauri::command]
fn set_log_level(runtime: State<'_, Runtime>, level: String) -> Result<(), String> {
    let Some(level) = LogLevel::parse(&level) else {
        return Err(format!("Неизвестный уровень лога: '{level}'"));
    };
    let Some(logger) = runtime.logger.as_ref() else {
        return Err("Лог не запущен: писать некуда".to_owned());
    };
    let Some(storage) = runtime.storage.as_ref() else {
        return Err("Хранилище не запущено".to_owned());
    };

    let mut settings = runtime.settings.lock().expect("settings lock");
    let previous = settings.log_level;
    settings.log_level = level;

    // Сначала запись, потом применение: если сохранить не удалось, настройки
    // не должны разойтись с файлом.
    if let Err(error) = settings::save(&storage.settings_path(), &settings) {
        settings.log_level = previous;
        return Err(error);
    }
    drop(settings);

    logger.set_level(level);
    log::info!("Уровень лога изменён на '{level}'");
    Ok(())
}

/// Запись в лог из интерфейса. Нужна для ошибок JS и необработанных отказов:
/// иначе они не оставляют следа вообще (ADR 0004).
#[tauri::command]
fn log_frontend(level: String, message: String) -> Result<(), String> {
    match level.as_str() {
        "error" => log::error!("интерфейс: {message}"),
        "warn" => log::warn!("интерфейс: {message}"),
        "info" => log::info!("интерфейс: {message}"),
        "debug" => log::debug!("интерфейс: {message}"),
        other => return Err(format!("Неизвестный уровень лога: '{other}'")),
    }
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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            send_event,
            invoke_command,
            ask,
            ask_traced,
            startup_status,
            set_log_level,
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
            log::info!("Шина остановлена, выход");
            log::logger().flush();
        }
    });
}

//! Точка сборки приложения: сервисы ядра + шина + мост в интерфейс.
//!
//! Порядок инициализации строгий (ADR 0005):
//! **storage → settings → logging → bus → sink → modules → bus.start()**.
//! Логирование не может стартовать раньше, чем известно, куда писать,
//! а настройки — раньше, чем известно, где они лежат.
//!
//! Команды интерфейса живут в [`core::commands`] (ADR 0048). Здесь остаются
//! сборка, блокировка запуска, мост событий, регистрация команд и обработка
//! выхода — ни одной команды и ни одного правила домена.

mod core;
mod modules;

use std::sync::{Arc, Mutex};

use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};

use core::commands;
use core::infra::bus::{BusError, ERROR_TOPIC, MessageBus};
use core::infra::deps::Deps;
use core::infra::error::AppError;
use core::infra::sink::EventSink;
use core::runtime::{Runtime, StartupError};
use core::services::languages;
use core::services::logging;
use core::services::profiles;
use core::services::settings::{self, Settings};
use core::services::trash;
use core::services::window::SnapTracker;
use core::services::workspace;
use core::store::storage::{DEFAULT_PROFILE, Storage};

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
            if topic != ERROR_TOPIC
                && let Ok(report) = serde_json::to_value(BusError::new(
                    topic,
                    AppError::new(
                        "errors.bus.undelivered",
                        format!("событие не доставлено в интерфейс: {error}"),
                    )
                    .with("topic", topic)
                    .with("reason", error),
                ))
            {
                let _ = self.app.emit(ERROR_TOPIC, report);
            }
        }
    }
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
                "errors.startup.storage",
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
    let language = loaded.settings.language();
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
                loaded.warnings.push(
                    AppError::new(
                        "errors.startup.profileMissing",
                        format!(
                            "активный профиль '{}' не найден среди папок '{}'; выбран '{}'",
                            configured,
                            storage.profiles_dir().display(),
                            fallback.id
                        ),
                    )
                    .with("profile", &configured)
                    .with("path", storage.profiles_dir().display())
                    .with("chosen", &fallback.id),
                );
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
        return blocked(app, &root, &language, "errors.startup.write", reason);
    }

    // Проверка записи делом — до всего остального.
    if let Err(reason) = storage.probe() {
        return blocked(app, &root, &language, "errors.startup.write", reason);
    }
    let storage = Arc::new(storage);

    // 3. Логирование: с этого момента отказы оставляют след.
    let logger = match logging::init(storage.logs_dir(), loaded.settings.log.level) {
        Ok(logger) => logger,
        Err(reason) => {
            return blocked(app, &root, &language, "errors.startup.logging", reason);
        }
    };
    logging::install_panic_hook(logger.clone());

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

    // Рабочие пространства удалённых профилей не нужны: профиль мог исчезнуть
    // в проводнике или не дойти синхронизацией. Посторонние объекты в папке
    // не трогаем, но показываем в логе (ADR 0050).
    match workspace::prune(&storage.workspaces_dir(), &storage.profiles_dir()) {
        Ok(report) => {
            for name in report.removed {
                log::debug!("Удалено рабочее пространство без профиля: {name}");
            }
            for name in report.foreign {
                log::warn!("В папке рабочих пространств посторонний объект: {name}");
            }
        }
        Err(error) => log::warn!("Рабочие пространства не проверены: {error}"),
    }

    // Корзина - внутренняя страховка: записи старше 14 дней больше не нужны.
    // Чистка не блокирует запуск: отказ остаётся в логе, приложение работает.
    trash::sweep(&storage);

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
    if !storage.settings_path().exists()
        && let Err(error) = settings::save(&storage.settings_path(), &loaded.settings)
    {
        log::error!("{error}");
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
        snap: Mutex::new(SnapTracker::default()),
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
    reason: AppError,
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
        snap: Mutex::new(SnapTracker::default()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let runtime = boot(app.handle());
            app.manage(runtime);
            commands::window::show_main_window(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::bridge::send_event,
            commands::bridge::invoke_command,
            commands::bridge::ask,
            commands::bridge::ask_traced,
            commands::info::startup_status,
            commands::settings::settings_get,
            commands::settings::settings_set,
            commands::window::window_reset,
            commands::workspace::workspace_load,
            commands::workspace::workspace_save,
            commands::profiles::profiles_list,
            commands::profiles::profiles_usage,
            commands::profiles::profile_create,
            commands::profiles::profile_rename,
            commands::profiles::profile_delete,
            commands::profiles::profile_switch,
            commands::presets::presets_list,
            commands::presets::preset_default_get,
            commands::presets::preset_default_set,
            commands::presets::preset_create,
            commands::presets::preset_update,
            commands::presets::preset_rename,
            commands::presets::preset_duplicate,
            commands::presets::preset_delete,
            commands::languages::languages_catalog,
            commands::languages::language_load,
            commands::languages::language_export,
            commands::languages::language_export_file,
            commands::languages::language_revert,
            commands::languages::language_missing_write,
            commands::info::app_info,
            commands::info::logs_prune,
            commands::info::open_folder,
            commands::lifecycle::log_frontend,
            commands::lifecycle::exit_app
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
            commands::window::flush_geometry(app_handle);

            log::info!("Шина остановлена, выход");
            log::logger().flush();
        }
    });
}

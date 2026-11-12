//! Точка сборки приложения: ядро + мост в интерфейс + список подсистем.
//!
//! Порядок инициализации повторяет контракт образца:
//! **зависимости → подписки → публикация**, а диспетчер событий стартует
//! в самом конце.

mod core;
mod modules;

use std::sync::Arc;
use std::time::Duration;

use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};

use core::bus::MessageBus;
use core::deps::Deps;
use core::sink::EventSink;

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
        }
    }
}

/// Публикация события из интерфейса («выстрелил и забыл»).
#[tauri::command]
fn send_event(bus: State<'_, MessageBus>, topic: String, payload: Value) -> Result<(), String> {
    bus.dispatch_event(&topic, payload)
}

/// Синхронная команда из интерфейса. Ошибка вернётся в UI как отклонённый вызов.
#[tauri::command]
fn invoke_command(bus: State<'_, MessageBus>, topic: String, payload: Value) -> Result<(), String> {
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
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(5000));
    bus.ask_traced(&topic, &reply_topic, payload, timeout)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // 1. Зависимости — до подписок (строгий порядок из образца).
            let deps = Deps::new();
            deps.add(app.handle().clone());

            // 2. Шина и её выход в интерфейс.
            let bus = MessageBus::new(deps);
            bus.set_sink(Arc::new(TauriSink {
                app: app.handle().clone(),
            }));

            // 3. Регистрация подсистем.
            modules::register_all(&bus);

            // 4. Запуск фонового диспетчера и публикация шины в состояние Tauri.
            bus.start();
            app.manage(bus);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            send_event,
            invoke_command,
            ask,
            ask_traced
        ])
        .build(tauri::generate_context!())
        .expect("ошибка при построении приложения Tauri");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            // Корректное завершение: дождаться обработки очереди событий.
            // `stop()` вызывается в потоке ОС, а не в диспетчере — дедлока нет.
            app_handle.state::<MessageBus>().stop();
        }
    });
}

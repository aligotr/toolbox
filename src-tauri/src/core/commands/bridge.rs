//! Команды моста: события, синхронные команды и запросы с ответом.
//!
//! Интерфейс не знает имён обработчиков: он передаёт топик, а шина находит
//! маршрут. Поэтому здесь нет ни одного правила домена — только передача.

use std::time::Duration;

use serde_json::Value;
use tauri::State;

use crate::core::infra::bus::MessageBus;
use crate::core::infra::error::AppResult;

/// Публикация события из интерфейса («выстрелил и забыл»).
#[tauri::command]
pub(crate) fn send_event(
    bus: State<'_, MessageBus>,
    topic: String,
    payload: Value,
) -> AppResult<()> {
    log::debug!("IPC send_event: '{topic}'");
    bus.dispatch_event(&topic, payload)
}

/// Синхронная команда из интерфейса. Ошибка вернётся в UI как отклонённый вызов.
#[tauri::command]
pub(crate) fn invoke_command(
    bus: State<'_, MessageBus>,
    topic: String,
    payload: Value,
) -> AppResult<()> {
    log::debug!("IPC invoke_command: '{topic}'");
    bus.dispatch_command(&topic, payload)
}

/// Запрос/ответ из интерфейса: шина ждёт событие с тем же `correlation_id`.
#[tauri::command]
pub(crate) fn ask(
    bus: State<'_, MessageBus>,
    topic: String,
    reply_topic: String,
    payload: Value,
    timeout_ms: Option<u64>,
) -> AppResult<Value> {
    log::debug!("IPC ask: '{topic}' → '{reply_topic}'");
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(5000));
    bus.ask(&topic, &reply_topic, payload, timeout)
}

/// Учебный прогон: тот же `ask`, но ядро записывает цепочку и присылает
/// её событием `core:trace`. Обычные запросы ничего не трассируют.
#[tauri::command]
pub(crate) fn ask_traced(
    bus: State<'_, MessageBus>,
    topic: String,
    reply_topic: String,
    payload: Value,
    timeout_ms: Option<u64>,
) -> AppResult<Value> {
    log::debug!("IPC ask_traced: '{topic}' → '{reply_topic}'");
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(5000));
    bus.ask_traced(&topic, &reply_topic, payload, timeout)
}

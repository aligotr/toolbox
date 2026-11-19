//! Уведомления поверх экрана (ADR 0058).
//!
//! Уведомление - факт, который требует внимания сейчас, но не стоит
//! модального диалога. Оно живёт секунды и не сохраняется; история остаётся
//! в журнале, и запись туда делает отправитель отдельно.
//!
//! Ядро не знает язык интерфейса, поэтому событие несёт код словаря
//! и параметры, а не готовый текст (ADR 0039). `fallback` - русский текст
//! на случай, если кода нет в словаре.

use serde::Serialize;
use serde_json::{Map, Value};

use super::bus::MessageBus;
use super::message::{Event, Message};

/// Топик уведомлений для интерфейса.
pub const NOTIFY_TOPIC: &str = "core:notify";

/// Вид уведомления: он же `severity` PrimeVue.
///
/// Все четыре вида - контракт с интерфейсом; сейчас ядро шлёт только
/// `info`, остальные появятся у новых отправителей.
#[allow(dead_code)]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum NotificationKind {
    Info,
    Success,
    Warn,
    Error,
}

/// Уведомление для интерфейса.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Notification {
    pub kind: NotificationKind,
    /// Ключ словаря: текст переводится при показе.
    pub code: String,
    /// Подстановки сообщения.
    #[serde(skip_serializing_if = "Map::is_empty")]
    pub params: Map<String, Value>,
    /// Русский текст, если ключа нет в словаре.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fallback: Option<String>,
    /// Ключ замены: новое уведомление вытесняет предыдущее с той же группой.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
}

impl Notification {
    /// Уведомление по коду словаря.
    pub fn new(kind: NotificationKind, code: impl Into<String>) -> Self {
        Self {
            kind,
            code: code.into(),
            params: Map::new(),
            fallback: None,
            group: None,
        }
    }

    /// Добавляет подстановки сообщения.
    pub fn with_params(mut self, params: Map<String, Value>) -> Self {
        self.params = params;
        self
    }

    /// Ключ замены для повторяющихся фактов.
    pub fn with_group(mut self, group: impl Into<String>) -> Self {
        self.group = Some(group.into());
        self
    }
}

impl Message for Notification {
    const TOPIC: &'static str = NOTIFY_TOPIC;
}

impl Event for Notification {}

/// Публикует уведомление в шину.
pub fn send(bus: &MessageBus, notification: Notification) {
    bus.publish_event(notification);
}

#[cfg(test)]
mod tests {
    //! Контракт с интерфейсом: топик, вид, код и подстановки.

    use super::*;

    #[test]
    fn notification_carries_topic_kind_and_params() {
        let mut params = Map::new();
        params.insert("count".to_owned(), Value::from(3));

        let notification = Notification::new(NotificationKind::Warn, "test.notify")
            .with_params(params)
            .with_group("test");

        assert_eq!(<Notification as Message>::TOPIC, "core:notify");

        let payload = serde_json::to_value(&notification).expect("уведомление сериализуется");
        assert_eq!(payload["kind"], "warn");
        assert_eq!(payload["code"], "test.notify");
        assert_eq!(payload["params"]["count"], 3);
        assert_eq!(payload["group"], "test");
        assert!(payload.get("fallback").is_none(), "пустой резерв не шлётся");
    }

    #[test]
    fn empty_params_are_omitted() {
        let notification = Notification::new(NotificationKind::Info, "test.notify");
        let payload = serde_json::to_value(&notification).expect("уведомление сериализуется");

        assert!(payload.get("params").is_none());
        assert!(payload.get("group").is_none());
        assert!(payload.get("fallback").is_none());
    }
}

//! Служебный модуль шины: самопроверка «пинг-понг».
//!
//! Нужен, чтобы проверить всю цепочку целиком, не трогая прикладные подсистемы:
//!
//! ```text
//! UI --ask("core:ping")--> шина --событие Ping--> обработчик
//!                                                 │
//!        UI <--событие Pong (тот же correlation_id)--┘
//! ```
//!
//! Если UI получил `core:pong`, значит работают: разбор JSON, очередь событий,
//! фоновый диспетчер, корреляция запрос/ответ и мост событий в интерфейс.

use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::core::bus::MessageBus;
use crate::core::message::{Event, Message};
use crate::core::module::Module;

/// Предел показательной задержки: дольше ждать незачем, а диспетчер
/// и очередь не должны зависать из-за учебного прогона.
const MAX_DELAY_MS: u64 = 5_000;

/// Событие-запрос самопроверки.
///
/// `correlation_id` приходит от шины (метод `ask` вкладывает его в нагрузку).
/// Обработчик обязан вернуть его в ответе — иначе шина не найдёт ожидающего.
#[derive(Debug, Deserialize, Serialize)]
pub struct Ping {
    pub echo: Option<String>,
    /// Показательная задержка ответа в миллисекундах.
    ///
    /// Задаётся только учебным прогоном: без неё главный кадр — «команда
    /// ждёт ответа, а диспетчер свободен» — показать нечем. В обычной
    /// самопроверке поле не передаётся, и ответ приходит сразу.
    #[serde(default)]
    pub delay_ms: Option<u64>,
    #[serde(default)]
    pub correlation_id: Option<String>,
}

impl Message for Ping {
    const TOPIC: &'static str = "core:ping";
}

impl Event for Ping {}

/// Событие-ответ на [`Ping`].
#[derive(Debug, Serialize)]
pub struct Pong {
    pub echo: Option<String>,
    /// Момент ответа в миллисекундах (для наглядности в интерфейсе).
    pub at: u64,
    /// Тот же идентификатор, что пришёл в запросе.
    pub correlation_id: Option<String>,
}

impl Message for Pong {
    const TOPIC: &'static str = "core:pong";
}

impl Event for Pong {}

/// Модуль самопроверки шины.
pub struct CorePingModule;

impl Module for CorePingModule {
    fn id(&self) -> &'static str {
        "core.ping"
    }

    fn register(&self, bus: &MessageBus) {
        // Маршрут нужен, чтобы UI мог отправить `core.ping` строкой топика.
        bus.register_event_route::<Ping>();

        // Обработчик получает клон шины, чтобы опубликовать ответ.
        // Клон дешёвый: внутри — общий `Arc`.
        //
        // Важно: подписка вызывается на `bus`, а замыкание `move` захватывает
        // отдельный клон `bus_for_handler`. Если захватывать тот же `bus`,
        // компилятор не даст совместить заимствование (`&self` подписки)
        // с перемещением значения в замыкание.
        let bus_for_handler = bus.clone();
        bus.subscribe_event::<Ping>(move |event, _deps| {
            // Задержка выполняется в отдельном потоке, а не в диспетчере:
            // иначе очередь встала бы и «диспетчер свободен во время
            // ожидания» было бы неправдой.
            match event.delay_ms {
                Some(ms) => {
                    let bus = bus_for_handler.clone();
                    let echo = event.echo.clone();
                    let correlation_id = event.correlation_id.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(Duration::from_millis(ms.min(MAX_DELAY_MS)));
                        bus.publish_event(Pong {
                            echo,
                            at: now_ms(),
                            correlation_id,
                        });
                    });
                }
                None => bus_for_handler.publish_event(Pong {
                    echo: event.echo.clone(),
                    at: now_ms(),
                    correlation_id: event.correlation_id.clone(),
                }),
            }
        });
    }
}

/// Текущее время в миллисекундах от начала эпохи UNIX.
fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    //! Проверка показательной задержки: она настоящая и не блокирует диспетчер.

    use super::*;
    use crate::core::deps::Deps;
    use std::time::Instant;

    #[test]
    fn delayed_ping_replies_after_delay() {
        let bus = MessageBus::new(Deps::new());
        CorePingModule.register(&bus);
        bus.start();

        let started = Instant::now();
        let reply = bus
            .ask(
                Ping::TOPIC,
                Pong::TOPIC,
                serde_json::json!({ "echo": "тест", "delay_ms": 60 }),
                Duration::from_secs(2),
            )
            .expect("ответ должен прийти");
        let elapsed = started.elapsed();
        bus.stop();

        assert_eq!(reply["echo"], "тест");
        assert!(
            elapsed >= Duration::from_millis(50),
            "задержка должна быть настоящей, прошло {elapsed:?}"
        );
    }

    #[test]
    fn ping_without_delay_answers_immediately() {
        let bus = MessageBus::new(Deps::new());
        CorePingModule.register(&bus);
        bus.start();

        let started = Instant::now();
        bus.ask(
            Ping::TOPIC,
            Pong::TOPIC,
            serde_json::json!({ "echo": "быстро" }),
            Duration::from_secs(2),
        )
        .expect("ответ должен прийти");
        let elapsed = started.elapsed();
        bus.stop();

        assert!(
            elapsed < Duration::from_millis(500),
            "без delay_ms ответ приходит сразу, прошло {elapsed:?}"
        );
    }
}

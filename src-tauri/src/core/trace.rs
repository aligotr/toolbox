//! Запись одной учебной цепочки сообщений.
//!
//! Постоянной трассировки в приложении нет (ADR 0007). Запись взводится на
//! один `ask`: запоминается `correlation_id`, а все точки съёма в шине
//! добавляют этап только в том случае, если идентификатор совпал.
//!
//! Почему фильтр по идентификатору, а не контекст в потоке: `correlation_id`
//! уже проходит через запрос, ответ и сопоставление, поэтому одной цепочке
//! этого достаточно. Контекст в потоке понадобился бы только для трассировки
//! всех событий подряд — этот сценарий отклонён.
//!
//! Готовая цепочка отдаётся в интерфейс целиком: проигрывание с паузами
//! управляется интерфейсом, потоковая отправка этапов не нужна.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Instant;

use serde::Serialize;
use serde_json::Value;

/// Топик, под которым готовая цепочка уходит в интерфейс.
pub const TRACE_TOPIC: &str = "core:trace";

/// Этап цепочки.
#[derive(Clone, Debug, Serialize)]
pub struct Stage {
    /// Имя этапа, например `queue.enqueue`.
    pub name: &'static str,
    /// Топик сообщения, к которому относится этап.
    pub topic: String,
    /// Миллисекунды от начала записи.
    pub at_ms: f64,
    /// Пояснение: сколько ждали в очереди, куда смотрела корреляция.
    pub detail: Option<String>,
}

/// Готовая цепочка: одна учебная транзакция `ask` целиком.
#[derive(Clone, Debug, Serialize)]
pub struct Chain {
    /// Топик запроса.
    pub topic: String,
    /// Топик ожидаемого ответа.
    pub reply_topic: String,
    pub stages: Vec<Stage>,
    /// `ok`, `timeout` или `error`.
    pub outcome: &'static str,
    /// Полное время от запроса до ответа.
    pub elapsed_ms: f64,
}

/// Взведённая запись.
struct Active {
    correlation_id: String,
    topic: String,
    reply_topic: String,
    started: Instant,
    stages: Vec<Stage>,
}

/// Рекордер цепочки. Живёт в шине; в обычной работе пуст.
#[derive(Default)]
pub struct Recorder {
    active: Mutex<Option<Active>>,
    /// Быстрая проверка «запись взведена» без захвата мьютекса.
    ///
    /// Значение — только подсказка: настоящая проверка всё равно идёт под
    /// мьютексом. Поэтому достаточно `Relaxed`.
    armed: AtomicBool,
}

impl Recorder {
    pub fn new() -> Self {
        Self::default()
    }

    /// Взводит запись на конкретный запрос. Предыдущая запись отбрасывается:
    /// одновременно учебный прогон идёт только один.
    pub fn arm(&self, correlation_id: &str, topic: &str, reply_topic: &str) {
        *self.active.lock().expect("recorder lock") = Some(Active {
            correlation_id: correlation_id.to_owned(),
            topic: topic.to_owned(),
            reply_topic: reply_topic.to_owned(),
            started: Instant::now(),
            stages: Vec::new(),
        });
        self.armed.store(true, Ordering::Relaxed);
    }

    /// Пишет этап, если запись взведена на этот `correlation_id`.
    pub fn stage_for(
        &self,
        correlation_id: &str,
        name: &'static str,
        topic: &str,
        detail: Option<String>,
    ) {
        if !self.armed.load(Ordering::Relaxed) {
            return;
        }
        let mut guard = self.active.lock().expect("recorder lock");
        let Some(active) = guard.as_mut() else {
            return;
        };
        if active.correlation_id != correlation_id {
            return;
        }
        active.stages.push(Stage {
            name,
            topic: topic.to_owned(),
            at_ms: active.started.elapsed().as_secs_f64() * 1000.0,
            detail,
        });
    }

    /// Пишет этап по нагрузке сообщения: идентификатор берётся оттуда.
    ///
    /// Так вызываются точки съёма, у которых на руках только JSON события.
    pub fn stage_of(&self, payload: &Value, name: &'static str, topic: &str, detail: Option<String>) {
        let Some(id) = payload.get("correlation_id").and_then(Value::as_str) else {
            return;
        };
        self.stage_for(id, name, topic, detail);
    }

    /// Завершает запись и отдаёт цепочку. `None`, если запись не была взведена.
    pub fn finish(&self, outcome: &'static str) -> Option<Chain> {
        let mut guard = self.active.lock().expect("recorder lock");
        self.armed.store(false, Ordering::Relaxed);
        let active = guard.take()?;
        Some(Chain {
            topic: active.topic,
            reply_topic: active.reply_topic,
            stages: active.stages,
            outcome,
            elapsed_ms: active.started.elapsed().as_secs_f64() * 1000.0,
        })
    }
}

#[cfg(test)]
mod tests {
    //! Проверки контракта рекордера: без записи он молчит, с записью
    //! собирает только свою цепочку.

    use super::*;
    use serde_json::json;

    #[test]
    fn ignores_stages_without_armed_record() {
        let recorder = Recorder::new();
        recorder.stage_of(&json!({ "correlation_id": "a" }), "queue.enqueue", "test:x", None);

        assert!(recorder.finish("ok").is_none());
    }

    #[test]
    fn collects_only_matching_correlation() {
        let recorder = Recorder::new();
        recorder.arm("a", "test:request", "test:reply");

        recorder.stage_of(&json!({ "correlation_id": "a" }), "ask.start", "test:request", None);
        recorder.stage_of(&json!({ "correlation_id": "b" }), "queue.enqueue", "test:request", None);
        recorder.stage_of(&json!({ "echo": "без идентификатора" }), "sink.emit", "test:request", None);

        let chain = recorder.finish("ok").expect("цепочка должна собраться");
        assert_eq!(chain.stages.len(), 1);
        assert_eq!(chain.stages[0].name, "ask.start");
        assert_eq!(chain.topic, "test:request");
        assert_eq!(chain.reply_topic, "test:reply");
    }

    #[test]
    fn stage_times_do_not_decrease() {
        let recorder = Recorder::new();
        recorder.arm("a", "test:request", "test:reply");

        for name in ["ask.start", "route.decode", "queue.enqueue"] {
            recorder.stage_for("a", name, "test:request", None);
        }

        let chain = recorder.finish("ok").expect("цепочка должна собраться");
        let times: Vec<f64> = chain.stages.iter().map(|stage| stage.at_ms).collect();
        assert!(times.windows(2).all(|pair| pair[0] <= pair[1]));
    }

    #[test]
    fn finish_clears_the_record() {
        let recorder = Recorder::new();
        recorder.arm("a", "test:request", "test:reply");
        recorder.stage_for("a", "ask.start", "test:request", None);

        assert!(recorder.finish("ok").is_some());
        assert!(recorder.finish("ok").is_none(), "вторая выдача невозможна");
    }
}

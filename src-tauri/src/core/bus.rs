//! Шина сообщений — центральный механизм обмена данными.
//!
//! Модель (по образцу, с уточнениями):
//!
//! * **Событие (`Event`)** — уведомление о факте. Доставляется **асинхронно**:
//!   кладётся в очередь и обрабатывается фоновым потоком-диспетчером. Подписчиков
//!   может быть много. Ошибка одного подписчика не мешает остальным (пишется в лог).
//!
//! * **Команда (`Command`)** — императивная операция (жизненный цикл, трей,
//!   настройки, отмена и т.п.). Выполняется **синхронно** в вызывающем потоке,
//!   ровно **одним** обработчиком, а ошибка возвращается вызывающему.
//!
//! * **Запрос/ответ (`ask`)** — не отдельный тип, а соглашение поверх событий:
//!   запрос и ответ несут общее поле `correlation_id`, по которому шина
//!   находит ожидающего.
//!
//! Порядок инициализации строгий, как в образце:
//! **зависимости → подписки/маршруты → публикация → `start()`**.

use std::any::{Any, TypeId};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex, RwLock};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::{json, Value};

use super::deps::Deps;
use super::message::{Command, Event};
use super::sink::EventSink;
use super::trace::{self, Recorder};

/// Обработчик события. Первый аргумент — само сообщение (стёртое до `dyn Any`,
/// чтобы хранить обработчики разных типов в одной коллекции), второй — контейнер
/// зависимостей.
type EventHandler = Arc<dyn Fn(&dyn Any, &Deps) + Send + Sync>;

/// Обработчик команды. Отличия от события: ровно один на тип, вызывается
/// синхронно, ошибка пробрасывается наверх.
type CommandHandler = Arc<dyn Fn(&dyn Any, &Deps) + Send + Sync>;

/// Маршрут события: превращает «сырой» JSON (пришедший из UI) в готовое
/// сообщение, лежащее в очереди. Нужен, потому что UI общается строками-топиками,
/// а шина — типами Rust.
type EventRoute = Arc<dyn Fn(Value) -> Result<QueuedEvent, String> + Send + Sync>;

/// Маршрут команды: разбирает JSON в конкретный тип и вызывает обработчик.
type CommandRoute = Arc<dyn Fn(Value, &Deps) -> Result<(), String> + Send + Sync>;

/// Событие, готовое к постановке в очередь.
struct QueuedEvent {
    /// Тип сообщения — по нему ищутся локальные подписчики.
    type_id: TypeId,
    /// Имя топика — уходит в UI и в логи.
    topic: &'static str,
    /// Сериализованные данные — уходят в UI.
    payload: Value,
    /// Само сообщение — передаётся локальным обработчикам.
    message: Box<dyn Any + Send>,
    /// Момент постановки в очередь: по нему считается ожидание диспетчера.
    queued_at: Instant,
}

/// Ожидание ответа на запрос `ask`.
///
/// Хранится не просто канал, а ещё и **топик ожидаемого ответа**. Без этого
/// шина приняла бы за ответ сам запрос: он тоже несёт `correlation_id` и
/// прошел бы через тот же код доставки. Сравнение топиков гарантирует, что
/// ожидание снимет именно ответ.
struct PendingAsk {
    reply_topic: String,
    sender: Sender<Value>,
}

/// Топик, под которым шина сообщает об отказе, иначе оставшемся бы незамеченным.
///
/// Слушает его журнал интерфейса. Модули этот топик не публикуют.
pub const ERROR_TOPIC: &str = "core:error";

/// Отказ шины для журнала: короткая строка без подробностей (ADR 0008).
///
/// Подробности — причина паники, текст ошибки сериализации — остаются
/// в файловом логе: в журнале они не нужны в обычной работе.
#[derive(Clone, Debug, Serialize)]
pub struct BusError {
    /// Топик сообщения, при обработке которого случился отказ.
    pub source: String,
    /// Что именно не удалось.
    pub text: String,
}

impl BusError {
    pub fn new(source: impl Into<String>, text: impl Into<String>) -> Self {
        Self {
            source: source.into(),
            text: text.into(),
        }
    }
}

/// Общее состояние шины. Спрятано в `Arc`, чтобы `MessageBus` дёшево клонировался
/// (например, для передачи в замыкание обработчика).
struct Inner {
    deps: Deps,
    event_handlers: RwLock<HashMap<TypeId, Vec<EventHandler>>>,
    event_routes: RwLock<HashMap<&'static str, EventRoute>>,
    command_handlers: RwLock<HashMap<TypeId, CommandHandler>>,
    command_routes: RwLock<HashMap<&'static str, CommandRoute>>,
    sink: RwLock<Option<Arc<dyn EventSink>>>,
    /// Канал в поток-диспетчер. `None` — шина ещё не запущена или уже остановлена
    /// (тогда события доставляются синхронно, что удобно в тестах).
    sender: Mutex<Option<Sender<QueuedEvent>>>,
    worker: Mutex<Option<JoinHandle<()>>>,
    /// Ожидающие ответа на запрос `ask`: ключ — `correlation_id`.
    pending: Mutex<HashMap<String, PendingAsk>>,
    /// Запись учебной цепочки. Пуста в обычной работе.
    recorder: Recorder,
}

/// Сообщает об отказе, который иначе остался бы незамеченным.
///
/// Пишет причину в файловый лог и отправляет короткую строку в журнал
/// событием [`ERROR_TOPIC`]. Событие уходит напрямую в приёмник, минуя
/// очередь: если отказала сама шина, отправлять через неё бессмысленно.
fn report_fault(inner: &Inner, source: &str, text: impl Into<String>) {
    let text = text.into();
    log::error!("{text}");
    let Some(sink) = inner.sink.read().expect("sink lock").clone() else {
        return;
    };
    if let Ok(payload) = serde_json::to_value(BusError::new(source, text)) {
        sink.emit(ERROR_TOPIC, payload);
    }
}

/// Шина сообщений. Клонируется дёшево: внутри — один `Arc`.
#[derive(Clone)]
pub struct MessageBus {
    inner: Arc<Inner>,
}

impl MessageBus {
    /// Создаёт шину с готовым контейнером зависимостей.
    pub fn new(deps: Deps) -> Self {
        Self {
            inner: Arc::new(Inner {
                deps,
                event_handlers: RwLock::new(HashMap::new()),
                event_routes: RwLock::new(HashMap::new()),
                command_handlers: RwLock::new(HashMap::new()),
                command_routes: RwLock::new(HashMap::new()),
                sink: RwLock::new(None),
                sender: Mutex::new(None),
                worker: Mutex::new(None),
                pending: Mutex::new(HashMap::new()),
                recorder: Recorder::new(),
            }),
        }
    }

    /// Контейнер зависимостей — обработчики достают из него нужное.
    ///
    /// Пока метод не вызывается внутри крейта (обработчики получают `&Deps`
    /// напрямую), но это часть публичного API ядра — отсюда `allow`.
    #[allow(dead_code)]
    pub fn deps(&self) -> &Deps {
        &self.inner.deps
    }

    /// Назначает приёмник событий (обычно — мост в интерфейс).
    pub fn set_sink(&self, sink: Arc<dyn EventSink>) {
        *self.inner.sink.write().expect("sink lock") = Some(sink);
    }

    // ─────────────────────────────── События ───────────────────────────────

    /// Подписка на событие типа `E`. Подписчиков может быть много.
    pub fn subscribe_event<E>(&self, handler: impl Fn(&E, &Deps) + Send + Sync + 'static)
    where
        E: Event,
    {
        let handler: EventHandler = Arc::new(move |any: &dyn Any, deps: &Deps| {
            // downcast не падает: обработчик зарегистрирован под типом E,
            // а коллекция ключуется по TypeId.
            if let Some(event) = any.downcast_ref::<E>() {
                handler(event, deps);
            }
        });
        self.inner
            .event_handlers
            .write()
            .expect("event handlers lock")
            .entry(TypeId::of::<E>())
            .or_default()
            .push(handler);
    }

    /// Регистрирует маршрут события: позволяет UI отправить событие по имени
    /// топика (строка + JSON), а шина разберёт его в конкретный тип `E`.
    pub fn register_event_route<E>(&self)
    where
        E: Event + DeserializeOwned + Serialize,
    {
        // Слабая ссылка, а не клон шины: маршрут хранится внутри шины,
        // и сильная ссылка замкнула бы владение само на себя.
        let weak = Arc::downgrade(&self.inner);
        let route: EventRoute = Arc::new(move |value: Value| {
            let event: E = serde_json::from_value(value)
                .map_err(|e| format!("Некорректное событие '{}': {e}", E::TOPIC))?;
            // Сериализация нужна только мосту в интерфейс: локальные
            // подписчики получают типизированное сообщение. Поэтому потеря
            // данных здесь не отменяет доставку, но обязана оставить след.
            let payload = match serde_json::to_value(&event) {
                Ok(payload) => payload,
                Err(error) => {
                    if let Some(inner) = weak.upgrade() {
                        report_fault(
                            &inner,
                            E::TOPIC,
                            format!("событие '{}' не сериализовано: {error}", E::TOPIC),
                        );
                    }
                    Value::Null
                }
            };
            Ok(QueuedEvent {
                type_id: TypeId::of::<E>(),
                topic: E::TOPIC,
                payload,
                message: Box::new(event),
                queued_at: Instant::now(),
            })
        });
        self.inner
            .event_routes
            .write()
            .expect("event routes lock")
            .insert(E::TOPIC, route);
    }

    /// Публикация события из Rust-кода.
    pub fn publish_event<E>(&self, event: E)
    where
        E: Event + Serialize + Send + 'static,
    {
        let payload = match serde_json::to_value(&event) {
            Ok(payload) => payload,
            Err(error) => {
                report_fault(
                    &self.inner,
                    E::TOPIC,
                    format!("событие '{}' не сериализовано: {error}", E::TOPIC),
                );
                Value::Null
            }
        };
        // Публикация внутри обработчика продолжает ту же цепочку: если запись
        // взведена на этот correlation_id, этап попадёт в неё.
        self.inner
            .recorder
            .stage_of(&payload, "publish(reply)", E::TOPIC, None);
        let queued = QueuedEvent {
            type_id: TypeId::of::<E>(),
            topic: E::TOPIC,
            payload,
            message: Box::new(event),
            queued_at: Instant::now(),
        };
        self.enqueue(queued);
    }

    /// Публикация события по имени топика (путь из интерфейса).
    pub fn dispatch_event(&self, topic: &str, payload: Value) -> Result<(), String> {
        // Идентификатор нужен до разбора: при ошибке нагрузка уже перемещена.
        let trace_id = payload
            .get("correlation_id")
            .and_then(Value::as_str)
            .map(str::to_owned);

        let route = match self
            .inner
            .event_routes
            .read()
            .expect("event routes lock")
            .get(topic)
            .cloned()
        {
            Some(route) => route,
            None => {
                if let Some(id) = &trace_id {
                    self.inner.recorder.stage_for(
                        id,
                        "route.decode",
                        topic,
                        Some("неизвестный топик".to_owned()),
                    );
                }
                log::warn!("Неизвестное событие: '{topic}'");
                return Err(format!("Неизвестное событие: '{topic}'"));
            }
        };

        let queued = match route(payload) {
            Ok(queued) => queued,
            Err(error) => {
                if let Some(id) = &trace_id {
                    self.inner.recorder.stage_for(
                        id,
                        "route.decode",
                        topic,
                        Some(format!("ошибка разбора: {error}")),
                    );
                }
                return Err(error);
            }
        };

        if let Some(id) = &trace_id {
            self.inner.recorder.stage_for(id, "route.decode", topic, None);
        }
        self.enqueue(queued);
        Ok(())
    }

    /// Запрос/ответ поверх событий.
    ///
    /// Шина добавляет в полезную нагрузку `correlation_id`, публикует событие
    /// `topic` и ждёт, пока придёт событие `reply_topic` с тем же
    /// `correlation_id`. Так UI получает «обещание» результата, не зная
    /// деталей корреляции.
    ///
    /// `reply_topic` обязателен именно потому, что запрос и ответ — разные
    /// события. Если ждать «любое событие с этим id», шина поймает сам запрос
    /// и вернёт его же нагрузку вместо ответа.
    pub fn ask(
        &self,
        topic: &str,
        reply_topic: &str,
        payload: Value,
        timeout: Duration,
    ) -> Result<Value, String> {
        self.ask_inner(topic, reply_topic, payload, timeout, false)
    }

    /// То же, что [`MessageBus::ask`], но с записью учебной цепочки.
    ///
    /// Запись взводится только здесь: обычные запросы приложения ничего
    /// не трассируют (ADR 0007).
    pub fn ask_traced(
        &self,
        topic: &str,
        reply_topic: &str,
        payload: Value,
        timeout: Duration,
    ) -> Result<Value, String> {
        self.ask_inner(topic, reply_topic, payload, timeout, true)
    }

    /// Общая реализация запроса/ответа с необязательной записью цепочки.
    fn ask_inner(
        &self,
        topic: &str,
        reply_topic: &str,
        mut payload: Value,
        timeout: Duration,
        traced: bool,
    ) -> Result<Value, String> {
        let correlation_id = new_correlation_id();

        // Вкладываем correlation_id в объект; если нагрузка не объект —
        // оборачиваем её, чтобы не потерять.
        match payload.as_object_mut() {
            Some(map) => {
                map.insert("correlation_id".into(), json!(correlation_id));
            }
            None => {
                payload = json!({ "correlation_id": correlation_id, "payload": payload });
            }
        }

        let (tx, rx) = mpsc::channel::<Value>();
        self.inner
            .pending
            .lock()
            .expect("pending lock")
            .insert(
                correlation_id.clone(),
                PendingAsk {
                    reply_topic: reply_topic.to_string(),
                    sender: tx,
                },
            );

        // Запись взводится до публикации: иначе первые этапы потеряются.
        if traced {
            self.inner.recorder.arm(&correlation_id, topic, reply_topic);
            self.inner
                .recorder
                .stage_for(&correlation_id, "ask.start", topic, None);
        }

        // Публикуем запрос; при ошибке снимаем ожидание.
        if let Err(e) = self.dispatch_event(topic, payload) {
            self.inner.pending.lock().expect("pending lock").remove(&correlation_id);
            if traced {
                self.finish_trace(&correlation_id, "error", reply_topic, Some(e.clone()));
            }
            return Err(e);
        }

        let result = rx.recv_timeout(timeout);
        self.inner.pending.lock().expect("pending lock").remove(&correlation_id);

        if result.is_err() {
            log::warn!("Таймаут ожидания ответа на '{topic}'");
        }

        if traced {
            let (outcome, detail) = match &result {
                Ok(_) => ("ok", None),
                Err(_) => (
                    "timeout",
                    Some(format!("ответа нет за {} мс", timeout.as_millis())),
                ),
            };
            self.finish_trace(&correlation_id, outcome, reply_topic, detail);
        }

        result.map_err(|_| format!("Таймаут ожидания ответа на '{topic}'"))
    }

    /// Записывает последний этап, снимает запись и отдаёт цепочку в интерфейс.
    ///
    /// Цепочка уходит мимо очереди: если запись завершилась таймаутом,
    /// отправлять её через шину бессмысленно.
    fn finish_trace(
        &self,
        correlation_id: &str,
        outcome: &'static str,
        topic: &str,
        detail: Option<String>,
    ) {
        self.inner
            .recorder
            .stage_for(correlation_id, "ask.reply", topic, detail);
        let Some(chain) = self.inner.recorder.finish(outcome) else {
            return;
        };
        let sink = self.inner.sink.read().expect("sink lock").clone();
        if let Some(sink) = sink {
            match serde_json::to_value(&chain) {
                Ok(payload) => sink.emit(trace::TRACE_TOPIC, payload),
                Err(error) => report_fault(
                    &self.inner,
                    trace::TRACE_TOPIC,
                    format!("цепочка не сериализована: {error}"),
                ),
            }
        }
    }

    // ─────────────────────────────── Команды ───────────────────────────────

    /// Подписка на команду типа `C`. У команды может быть только **один**
    /// обработчик — попытка второго вернёт ошибку (как в образце).
    pub fn subscribe_command<C>(
        &self,
        handler: impl Fn(&C, &Deps) + Send + Sync + 'static,
    ) -> Result<(), String>
    where
        C: Command + DeserializeOwned,
    {
        let mut handlers = self.inner.command_handlers.write().expect("command handlers lock");
        if handlers.contains_key(&TypeId::of::<C>()) {
            return Err(format!("Команде '{}' уже назначен обработчик", C::TOPIC));
        }

        // Один и тот же обработчик нужен в двух местах: для прямого вызова
        // из Rust и для разбора JSON из UI. `Arc` позволяет разделить владение.
        let handler = Arc::new(handler);

        let direct = handler.clone();
        handlers.insert(
            TypeId::of::<C>(),
            Arc::new(move |any: &dyn Any, deps: &Deps| {
                if let Some(command) = any.downcast_ref::<C>() {
                    direct(command, deps);
                }
            }),
        );
        drop(handlers);

        let route: CommandRoute = Arc::new(move |value: Value, deps: &Deps| {
            let command: C = serde_json::from_value(value)
                .map_err(|e| format!("Некорректная команда '{}': {e}", C::TOPIC))?;
            handler(&command, deps);
            Ok(())
        });
        self.inner
            .command_routes
            .write()
            .expect("command routes lock")
            .insert(C::TOPIC, route);
        Ok(())
    }

    /// Вызов команды из Rust-кода (синхронно).
    ///
    /// Из интерфейса команды приходят через [`MessageBus::dispatch_command`].
    /// Этот вариант нужен внутренним подсистемам, когда команду инициирует
    /// Rust, а не UI (например, будущее меню в трее).
    #[allow(dead_code)]
    pub fn publish_command<C: Command>(&self, command: C) -> Result<(), String> {
        let handler = self
            .inner
            .command_handlers
            .read()
            .expect("command handlers lock")
            .get(&TypeId::of::<C>())
            .cloned()
            .ok_or_else(|| format!("Нет обработчика для команды '{}'", C::TOPIC))?;
        handler(&command as &dyn Any, &self.inner.deps);
        Ok(())
    }

    /// Вызов команды по имени топика (путь из интерфейса).
    pub fn dispatch_command(&self, topic: &str, payload: Value) -> Result<(), String> {
        let route = self
            .inner
            .command_routes
            .read()
            .expect("command routes lock")
            .get(topic)
            .cloned();

        let Some(route) = route else {
            log::warn!("Неизвестная команда: '{topic}'");
            return Err(format!("Неизвестная команда: '{topic}'"));
        };
        route(payload, &self.inner.deps)
    }

    // ────────────────────────────── Жизненный цикл ─────────────────────────

    /// Запускает поток-диспетчер событий. После этого события доставляются
    /// асинхронно, а команды — по-прежнему синхронно.
    pub fn start(&self) {
        let mut sender = self.inner.sender.lock().expect("sender lock");
        if sender.is_some() {
            return;
        }
        let (tx, rx) = mpsc::channel::<QueuedEvent>();
        let inner = self.inner.clone();
        let worker = std::thread::spawn(move || {
            // Поток живёт, пока в канале есть отправители. `stop()` закрывает
            // канал, `recv()` возвращает ошибку, цикл завершается.
            while let Ok(queued) = rx.recv() {
                dispatch(&inner, queued);
            }
        });
        *sender = Some(tx);
        *self.inner.worker.lock().expect("worker lock") = Some(worker);
    }

    /// Останавливает диспетчер, дождавшись обработки оставшихся событий.
    ///
    /// Важно: вызывать из потока-диспетчера нельзя — это `join()` самого себя
    /// (дедлок). Поэтому «выход» реализуется **командой** (синхронно,
    /// в вызывающем потоке), а не событием.
    pub fn stop(&self) {
        drop(self.inner.sender.lock().expect("sender lock").take());
        if let Some(worker) = self.inner.worker.lock().expect("worker lock").take() {
            let _ = worker.join();
        }
    }

    // ────────────────────────────── Внутреннее ─────────────────────────────

    /// Кладёт событие в очередь либо (если диспетчер не запущен) обрабатывает
    /// синхронно.
    fn enqueue(&self, queued: QueuedEvent) {
        let sender = self.inner.sender.lock().expect("sender lock").clone();
        match sender {
            Some(tx) => {
                self.inner
                    .recorder
                    .stage_of(&queued.payload, "queue.enqueue", queued.topic, None);
                // Топик нужен после перемещения сообщения в канал.
                let topic = queued.topic;
                if tx.send(queued).is_err() {
                    report_fault(
                        &self.inner,
                        topic,
                        format!("событие '{topic}' не встало в очередь: диспетчер остановлен"),
                    );
                }
            }
            None => {
                self.inner.recorder.stage_of(
                    &queued.payload,
                    "queue.enqueue",
                    queued.topic,
                    Some("синхронно: диспетчер не запущен".to_owned()),
                );
                dispatch(&self.inner, queued);
            }
        }
    }
}

/// Доставка одного события: локальные подписчики, затем ожидающий `ask`,
/// затем мост в интерфейс.
fn dispatch(inner: &Inner, queued: QueuedEvent) {
    let waited_ms = queued.queued_at.elapsed().as_secs_f64() * 1000.0;
    inner.recorder.stage_of(
        &queued.payload,
        "dispatch.begin",
        queued.topic,
        Some(format!("в очереди {waited_ms:.2} мс")),
    );

    let handlers = inner
        .event_handlers
        .read()
        .expect("event handlers lock")
        .get(&queued.type_id)
        .cloned()
        .unwrap_or_default();

    // Событие, опубликованное только ради журнала, подписчиков в Rust не имеет
    // по замыслу. Это `debug`, а не `warn`: предупреждение на штатной работе
    // обесценивает уровень целиком.
    if handlers.is_empty() {
        log::debug!("Нет обработчиков для события '{}'", queued.topic);
    }

    for handler in handlers {
        // Этап пишется до вызова: даже если подписчик упадёт, будет видно,
        // что цепочка дошла до него.
        inner
            .recorder
            .stage_of(&queued.payload, "handler.invoke", queued.topic, None);

        // Ошибка одного подписчика не должна мешать остальным — как в образце.
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            handler(queued.message.as_ref(), &inner.deps);
        }));
        if result.is_err() {
            report_fault(
                inner,
                queued.topic,
                format!("обработчик события '{}' завершился паникой", queued.topic),
            );
        }
    }

    // Если событие несёт correlation_id ожидающего запроса и его топик
    // совпадает с ожидаемым топиком ответа — отдаём ответ ожидающему.
    // Запрос сам по себе тоже несёт correlation_id, поэтому проверки топика
    // недостаточно заменить «любым событием с id»: так `ask` вернул бы запрос.
    if let Some(id) = queued.payload.get("correlation_id").and_then(Value::as_str) {
        let waiting_topic = inner
            .pending
            .lock()
            .expect("pending lock")
            .get(id)
            .map(|ask| ask.reply_topic.clone());

        let is_reply = waiting_topic.as_deref() == Some(queued.topic);
        let detail = match waiting_topic.as_deref() {
            None => "никто не ждёт этот идентификатор".to_owned(),
            Some(reply_topic) if !is_reply => format!("промах: ждём '{reply_topic}'"),
            Some(_) => "совпало".to_owned(),
        };
        inner
            .recorder
            .stage_of(&queued.payload, "correlation.match", queued.topic, Some(detail));

        if is_reply {
            if let Some(ask) = inner.pending.lock().expect("pending lock").remove(id) {
                let _ = ask.sender.send(queued.payload.clone());
            }
        }
    }

    // Мост в интерфейс: событие уходит в UI (если приёмник назначен).
    if let Some(sink) = inner.sink.read().expect("sink lock").clone() {
        inner
            .recorder
            .stage_of(&queued.payload, "sink.emit", queued.topic, None);
        sink.emit(queued.topic, queued.payload);
    }
}

/// Генерирует уникальный идентификатор корреляции: время + счётчик.
fn new_correlation_id() -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{t:x}-{n:x}")
}

#[cfg(test)]
mod tests {
    //! Проверки контрактов шины без запуска Tauri.
    //!
    //! Тесты намеренно работают на маленьких локальных сообщениях: так
    //! проверяется сам механизм, а не прикладные модули.

    use super::*;
    use crate::core::message::Message;
    use serde::{Deserialize, Serialize};
    use std::sync::atomic::{AtomicUsize, Ordering as AtomicOrdering};
    use std::sync::Mutex as StdMutex;
    use std::time::Duration;

    #[derive(Debug, Serialize, Deserialize)]
    struct TestRequest {
        value: u32,
        #[serde(default)]
        correlation_id: Option<String>,
    }

    impl Message for TestRequest {
        const TOPIC: &'static str = "test:request";
    }

    impl Event for TestRequest {}

    #[derive(Debug, Serialize, Deserialize)]
    struct TestReply {
        result: u32,
        correlation_id: Option<String>,
    }

    impl Message for TestReply {
        const TOPIC: &'static str = "test:reply";
    }

    impl Event for TestReply {}

    #[derive(Debug, Deserialize)]
    struct TestCommand;

    impl Message for TestCommand {
        const TOPIC: &'static str = "test:command";
    }

    impl Command for TestCommand {}

    /// `ask` должен вернуть именно ответ, а не эхо самого запроса.
    #[test]
    fn ask_returns_reply_not_request() {
        let bus = MessageBus::new(Deps::new());
        bus.register_event_route::<TestRequest>();

        let responder = bus.clone();
        bus.subscribe_event::<TestRequest>(move |request, _deps| {
            responder.publish_event(TestReply {
                result: request.value * 2,
                correlation_id: request.correlation_id.clone(),
            });
        });

        bus.start();
        let reply = bus
            .ask(
                TestRequest::TOPIC,
                TestReply::TOPIC,
                serde_json::json!({ "value": 21 }),
                Duration::from_secs(2),
            )
            .expect("ответ должен прийти");
        bus.stop();

        assert_eq!(reply["result"], 42);
        assert!(reply["correlation_id"].is_string());
    }

    /// У события может быть несколько независимых подписчиков.
    #[test]
    fn event_reaches_all_subscribers() {
        let bus = MessageBus::new(Deps::new());
        let hits = Arc::new(AtomicUsize::new(0));

        for _ in 0..2 {
            let hits = hits.clone();
            bus.subscribe_event::<TestReply>(move |_event, _deps| {
                hits.fetch_add(1, AtomicOrdering::Relaxed);
            });
        }

        bus.start();
        bus.publish_event(TestReply {
            result: 1,
            correlation_id: None,
        });
        // Дожидаемся обработки очереди: `stop()` дочитывает события.
        bus.stop();

        assert_eq!(hits.load(AtomicOrdering::Relaxed), 2);
    }

    /// У команды ровно один обработчик; второй должен быть отвергнут.
    #[test]
    fn command_allows_single_handler() {
        let bus = MessageBus::new(Deps::new());

        bus.subscribe_command::<TestCommand>(|_command, _deps| {})
            .expect("первый обработчик регистрируется");
        let second = bus.subscribe_command::<TestCommand>(|_command, _deps| {});

        assert!(second.is_err(), "второй обработчик должен быть отвергнут");
    }

    /// Приёмник событий получает топик и нагрузку.
    struct TestSink {
        tx: StdMutex<Sender<(String, Value)>>,
    }

    impl EventSink for TestSink {
        fn emit(&self, topic: &'static str, payload: Value) {
            let _ = self
                .tx
                .lock()
                .expect("test sink lock")
                .send((topic.to_string(), payload));
        }
    }

    #[test]
    fn sink_receives_topic_and_payload() {
        let bus = MessageBus::new(Deps::new());
        let (tx, rx) = mpsc::channel();
        bus.set_sink(Arc::new(TestSink {
            tx: StdMutex::new(tx),
        }));

        bus.start();
        bus.publish_event(TestReply {
            result: 7,
            correlation_id: None,
        });

        let (topic, payload) = rx.recv_timeout(Duration::from_secs(2)).expect("событие в приёмнике");
        bus.stop();

        assert_eq!(topic, TestReply::TOPIC);
        assert_eq!(payload["result"], 7);
    }

    /// Паника обработчика превращается в `core:error` для журнала (ADR 0008).
    #[test]
    fn handler_panic_reports_bus_error() {
        let bus = MessageBus::new(Deps::new());
        bus.register_event_route::<TestRequest>();
        bus.subscribe_event::<TestRequest>(|_request, _deps| panic!("нарочно"));

        let (tx, rx) = mpsc::channel();
        bus.set_sink(Arc::new(TestSink {
            tx: StdMutex::new(tx),
        }));

        bus.start();
        bus.dispatch_event(TestRequest::TOPIC, serde_json::json!({ "value": 1 }))
            .expect("событие принято в очередь");

        let report = wait_for_bus_error(&rx);
        bus.stop();

        assert_eq!(report["source"], TestRequest::TOPIC);
        assert!(
            report["text"].as_str().unwrap_or_default().contains("паникой"),
            "в отчёте должна быть причина: {report}"
        );
    }

    /// Событие, которое не сериализуется, тоже оставляет след в журнале.
    #[test]
    fn serialization_loss_reports_bus_error() {
        let bus = MessageBus::new(Deps::new());
        let (tx, rx) = mpsc::channel();
        bus.set_sink(Arc::new(TestSink {
            tx: StdMutex::new(tx),
        }));

        // Диспетчер не запущен: событие обрабатывается синхронно.
        bus.publish_event(BadEvent);

        let report = wait_for_bus_error(&rx);
        assert_eq!(report["source"], BadEvent::TOPIC);
        assert!(
            report["text"].as_str().unwrap_or_default().contains("не сериализовано"),
            "в отчёте должна быть причина: {report}"
        );
    }

    /// Событие, сериализация которого заведомо не удаётся.
    struct BadEvent;

    impl Message for BadEvent {
        const TOPIC: &'static str = "test:bad";
    }

    impl Event for BadEvent {}

    impl Serialize for BadEvent {
        fn serialize<S: serde::Serializer>(&self, _serializer: S) -> Result<S::Ok, S::Error> {
            Err(serde::ser::Error::custom("сериализация запрещена"))
        }
    }

    /// Ждёт в приёмнике отчёт `core:error`, пропуская остальные события.
    fn wait_for_bus_error(rx: &mpsc::Receiver<(String, Value)>) -> Value {
        let deadline = Instant::now() + Duration::from_secs(2);
        while Instant::now() < deadline {
            if let Ok((topic, payload)) = rx.recv_timeout(Duration::from_millis(100)) {
                if topic == ERROR_TOPIC {
                    return payload;
                }
            }
        }
        panic!("отчёт '{}' не пришёл в приёмник", ERROR_TOPIC);
    }

    /// Учебная запись собирает одну цепочку и отдаёт её в приёмник.
    #[test]
    fn ask_records_teaching_chain() {
        let bus = MessageBus::new(Deps::new());
        bus.register_event_route::<TestRequest>();

        let responder = bus.clone();
        bus.subscribe_event::<TestRequest>(move |request, _deps| {
            responder.publish_event(TestReply {
                result: request.value * 2,
                correlation_id: request.correlation_id.clone(),
            });
        });

        let (tx, rx) = mpsc::channel();
        bus.set_sink(Arc::new(TestSink {
            tx: StdMutex::new(tx),
        }));

        bus.start();
        bus.ask_traced(
            TestRequest::TOPIC,
            TestReply::TOPIC,
            serde_json::json!({ "value": 5 }),
            Duration::from_secs(2),
        )
        .expect("ответ должен прийти");
        bus.stop();

        let mut chain = None;
        while let Ok((topic, payload)) = rx.try_recv() {
            if topic == trace::TRACE_TOPIC {
                chain = Some(payload);
            }
        }
        let chain = chain.expect("цепочка должна прийти в приёмник");
        let names: Vec<&str> = chain["stages"]
            .as_array()
            .expect("stages — массив")
            .iter()
            .map(|stage| stage["name"].as_str().expect("имя этапа"))
            .collect();

        for expected in [
            "ask.start",
            "route.decode",
            "queue.enqueue",
            "dispatch.begin",
            "handler.invoke",
            "publish(reply)",
            "correlation.match",
            "sink.emit",
            "ask.reply",
        ] {
            assert!(names.contains(&expected), "нет этапа '{expected}': {names:?}");
        }
        assert_eq!(chain["outcome"], "ok");
    }

    /// Событие без `ask` учебной записи не создаёт.
    #[test]
    fn plain_event_is_not_traced() {        let bus = MessageBus::new(Deps::new());
        let (tx, rx) = mpsc::channel();
        bus.set_sink(Arc::new(TestSink {
            tx: StdMutex::new(tx),
        }));

        bus.start();
        bus.publish_event(TestReply {
            result: 3,
            correlation_id: None,
        });
        bus.stop();

        let mut topics = Vec::new();
        while let Ok((topic, _)) = rx.try_recv() {
            topics.push(topic);
        }
        assert!(
            !topics.iter().any(|topic| *topic == trace::TRACE_TOPIC),
            "трассы быть не должно: {topics:?}"
        );
    }

    /// Обычный `ask` цепочку не пишет: запись включает только учебный прогон.
    #[test]
    fn plain_ask_is_not_traced() {
        let bus = MessageBus::new(Deps::new());
        bus.register_event_route::<TestRequest>();

        let responder = bus.clone();
        bus.subscribe_event::<TestRequest>(move |request, _deps| {
            responder.publish_event(TestReply {
                result: request.value,
                correlation_id: request.correlation_id.clone(),
            });
        });

        let (tx, rx) = mpsc::channel();
        bus.set_sink(Arc::new(TestSink {
            tx: StdMutex::new(tx),
        }));

        bus.start();
        bus.ask(
            TestRequest::TOPIC,
            TestReply::TOPIC,
            serde_json::json!({ "value": 1 }),
            Duration::from_secs(2),
        )
        .expect("ответ должен прийти");
        bus.stop();

        let mut topics = Vec::new();
        while let Ok((topic, _)) = rx.try_recv() {
            topics.push(topic);
        }
        assert!(
            !topics.iter().any(|topic| *topic == trace::TRACE_TOPIC),
            "обычный ask не трассируется: {topics:?}"
        );
    }
}

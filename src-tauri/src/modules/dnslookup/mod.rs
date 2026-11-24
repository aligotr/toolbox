//! Подсистема DNS-проверки.
//!
//! Принимает запрос из интерфейса, выполняет запросы в четырёх потоках и
//! публикует результаты по мере готовности. Шина занята только приёмом
//! запроса и публикацией: сокеты работают в отдельных потоках, поэтому
//! интерфейс остаётся отзывчивым (ADR 0016).
//!
//! Модуль не пишет в лог: ошибки уходят либо в ответ на запуск, либо
//! в событие результата. Это правило подсистем (ADR 0012).

mod records;
mod request;
mod servers;
mod transport;

use std::collections::{HashMap, VecDeque};
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use crate::core::infra::bus::MessageBus;
use crate::core::infra::error::AppError;
use crate::core::infra::module::Module;
use crate::core::store::storage::Storage;

use request::{
    DnsCancel, DnsFinished, DnsResult, DnsRun, DnsRunAccepted, PreparedQuery, PreparedRun,
    ServersLoad, ServersLoadReply, ServersSave, ServersSaveReply, SystemServersReply,
    SystemServersRequest, Target,
};

/// Число одновременных запросов. Четыре — компромисс: сеть не забивается,
/// а таблица из десятков ячеек заполняется заметно быстрее, чем по одной.
const WORKERS: usize = 4;

/// Реестр активных проверок: по `run_id` хранится флаг отмены.
type ActiveRuns = Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>;

/// Модуль DNS-проверки.
pub struct DnsLookupModule {
    runs: ActiveRuns,
}

impl DnsLookupModule {
    /// Создаёт модуль с пустым реестром проверок.
    pub fn new() -> Self {
        Self {
            runs: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl Default for DnsLookupModule {
    fn default() -> Self {
        Self::new()
    }
}

impl Module for DnsLookupModule {
    fn id(&self) -> &'static str {
        "dnslookup"
    }

    fn register(&self, bus: &MessageBus) {
        bus.register_event_route::<DnsRun>();
        bus.register_event_route::<SystemServersRequest>();
        bus.register_event_route::<ServersLoad>();
        bus.register_event_route::<ServersSave>();

        let bus_for_run = bus.clone();
        let runs_for_run = self.runs.clone();
        bus.subscribe_event::<DnsRun>(move |event, _deps| {
            let accepted = start_run(&bus_for_run, &runs_for_run, event);
            bus_for_run.publish_event(accepted);
        });

        let runs_for_cancel = self.runs.clone();
        bus.subscribe_command::<DnsCancel>(move |command, _deps| {
            // Отравленный реестр означает панику другого потока, но отмена
            // не должна из-за этого ронять шину: флаг просто не ставится.
            let flag = runs_for_cancel
                .lock()
                .ok()
                .and_then(|runs| runs.get(&command.run_id).cloned());
            if let Some(flag) = flag {
                flag.store(true, Ordering::SeqCst);
            }
        })
        .expect("не удалось зарегистрировать команду dnslookup:cancel");

        let bus_for_system = bus.clone();
        bus.subscribe_event::<SystemServersRequest>(move |event, _deps| {
            // `ipconfig` опрашивает сеть и может думать сотни миллисекунд;
            // в обработчике шины он задержал бы остальные сообщения.
            let bus = bus_for_system.clone();
            let correlation_id = event.correlation_id.clone();
            std::thread::spawn(move || {
                let (servers, error) = match servers::system_addresses() {
                    Ok(addresses) => (addresses.iter().map(ToString::to_string).collect(), None),
                    Err(error) => (Vec::new(), Some(error)),
                };
                bus.publish_event(SystemServersReply {
                    servers,
                    error,
                    correlation_id,
                });
            });
        });

        let bus_for_load = bus.clone();
        bus.subscribe_event::<ServersLoad>(move |event, deps| {
            // Папку профиля знает только `Storage`: модуль не собирает пути
            // сам, иначе раскладка разошлась бы с остальными файлами.
            let (servers, error) = match deps.get::<Arc<Storage>>() {
                Some(storage) => match servers::load(&storage.data_dir()) {
                    Ok(servers) => (servers, None),
                    Err(error) => (Vec::new(), Some(error)),
                },
                None => (
                    Vec::new(),
                    Some(AppError::new(
                        "errors.dnslookup.noStorage",
                        "Хранилище профиля недоступно",
                    )),
                ),
            };
            bus_for_load.publish_event(ServersLoadReply {
                servers,
                error,
                correlation_id: event.correlation_id.clone(),
            });
        });

        let bus_for_save = bus.clone();
        bus.subscribe_event::<ServersSave>(move |event, deps| {
            let error = match deps.get::<Arc<Storage>>() {
                Some(storage) => servers::save(&storage.data_dir(), &event.servers).err(),
                None => Some(AppError::new(
                    "errors.dnslookup.noStorage",
                    "Хранилище профиля недоступно",
                )),
            };
            bus_for_save.publish_event(ServersSaveReply {
                saved: error.is_none(),
                error,
                correlation_id: event.correlation_id.clone(),
            });
        });
    }
}

/// Проверяет запрос, ставит его в реестр и запускает выполнение.
fn start_run(bus: &MessageBus, runs: &ActiveRuns, event: &DnsRun) -> DnsRunAccepted {
    let accepted = |accepted: bool, query_count: usize, error: Option<AppError>| DnsRunAccepted {
        run_id: event.run_id.clone(),
        accepted,
        query_count,
        error,
        correlation_id: event.correlation_id.clone(),
    };

    if event.run_id.trim().is_empty() {
        return accepted(
            false,
            0,
            Some(AppError::new(
                "errors.run.idMissing",
                "Не указан идентификатор проверки",
            )),
        );
    }

    let run = match request::prepare(event) {
        Ok(run) => run,
        Err(error) => return accepted(false, 0, Some(error)),
    };

    let needs_system = run
        .queries
        .iter()
        .any(|query| matches!(query.target, Target::System));
    let query_count = run.queries.len();
    let cancelled = Arc::new(AtomicBool::new(false));
    // Проверка и вставка под одной блокировкой: два одновременных запуска
    // с тем же `run_id` не должны оба попасть в реестр.
    match runs.lock() {
        Ok(mut active) => {
            if active.contains_key(&run.run_id) {
                return accepted(
                    false,
                    0,
                    Some(AppError::new(
                        "errors.run.exists",
                        "Проверка с этим идентификатором уже идёт",
                    )),
                );
            }
            active.insert(run.run_id.clone(), cancelled.clone());
        }
        Err(_) => {
            return accepted(
                false,
                0,
                Some(AppError::new(
                    "errors.run.registry",
                    "Реестр проверок недоступен",
                )),
            );
        }
    }

    let bus = bus.clone();
    let runs = runs.clone();
    std::thread::spawn(move || {
        let mut run = run;
        // Адреса системных резолверов читаются в рабочем потоке: запрос
        // к ОС не должен задерживать ответ «принято» и шину.
        if needs_system {
            match servers::system_addresses() {
                Ok(addresses) => {
                    run.system_addresses = addresses
                        .into_iter()
                        .map(|address| SocketAddr::new(address, 53))
                        .collect();
                }
                Err(error) => run.system_error = Some(error),
            }
        }
        execute(bus, runs, run, cancelled);
    });

    accepted(true, query_count, None)
}

/// Выполняет проверку: очередь запросов, рабочие потоки, завершение.
fn execute(bus: MessageBus, runs: ActiveRuns, run: PreparedRun, cancelled: Arc<AtomicBool>) {
    let started = Instant::now();
    let queue = Arc::new(Mutex::new(VecDeque::from(run.queries)));
    let completed = Arc::new(AtomicUsize::new(0));
    let system_addresses = Arc::new(run.system_addresses);
    let system_error = Arc::new(run.system_error);

    let mut workers = Vec::with_capacity(WORKERS);
    for _ in 0..WORKERS {
        let bus = bus.clone();
        let queue = queue.clone();
        let completed = completed.clone();
        let cancelled = cancelled.clone();
        let system_addresses = system_addresses.clone();
        let system_error = system_error.clone();
        let run_id = run.run_id.clone();

        workers.push(std::thread::spawn(move || {
            loop {
                // Отмена проверяется до взятия запроса: после неё новые ячейки
                // не начинаются, а уже начатые закрываются по таймауту.
                if cancelled.load(Ordering::SeqCst) {
                    break;
                }
                // Отравленная очередь означает панику другого рабочего: новые
                // запросы не берутся, но поток завершается штатно.
                let query = match queue.lock() {
                    Ok(mut queue) => queue.pop_front(),
                    Err(_) => break,
                };
                let Some(query) = query else {
                    break;
                };
                if let Some(result) = run_query(
                    &run_id,
                    &query,
                    &system_addresses,
                    &system_error,
                    &cancelled,
                ) {
                    bus.publish_event(result);
                    completed.fetch_add(1, Ordering::Relaxed);
                }
            }
        }));
    }

    for worker in workers {
        let _ = worker.join();
    }

    let was_cancelled = cancelled.load(Ordering::SeqCst);
    bus.publish_event(DnsFinished {
        run_id: run.run_id.clone(),
        completed: completed.load(Ordering::Relaxed),
        cancelled: was_cancelled,
        elapsed_ms: started.elapsed().as_millis() as u64,
    });
    // Отравленный реестр не отменяет завершение: проверка уже отработала.
    let _ = runs.lock().map(|mut active| {
        active.remove(&run.run_id);
    });
}

/// Проверяет одну ячейку и собирает событие результата.
fn run_query(
    run_id: &str,
    query: &PreparedQuery,
    system_addresses: &[SocketAddr],
    system_error: &Option<AppError>,
    cancelled: &AtomicBool,
) -> Option<DnsResult> {
    let addresses: Vec<SocketAddr> = match query.target {
        Target::Address(address) => vec![address],
        Target::System => system_addresses.to_vec(),
    };

    let started = Instant::now();
    let outcome = if matches!(query.target, Target::System) && addresses.is_empty() {
        transport::Outcome::bad(system_error.clone().unwrap_or_else(|| {
            AppError::new(
                "dnslookup.servers.systemMissing",
                "Системные резолверы не найдены",
            )
        }))
    } else {
        transport::resolve(&addresses, &query.name, query.record_type)
    };

    // Результат, посчитанный уже после отмены, не публикуется: интерфейс
    // помечает такие ячейки как отменённые.
    if cancelled.load(Ordering::SeqCst) {
        return None;
    }

    Some(DnsResult {
        run_id: run_id.to_owned(),
        query_id: query.query_id.clone(),
        row_id: query.row_id.clone(),
        server_id: query.server_id.clone(),
        status: outcome.status,
        answers: outcome.answers,
        elapsed_ms: Some(started.elapsed().as_millis() as u64),
        error: outcome.error,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::infra::deps::Deps;
    use crate::core::infra::message::Message as _;
    use hickory_proto::op::{Message, OpCode, ResponseCode};
    use hickory_proto::rr::rdata::A;
    use hickory_proto::rr::{Name, Record};
    use serde_json::json;
    use std::net::UdpSocket;
    use std::sync::mpsc;
    use std::time::Duration;

    #[test]
    fn run_publishes_result_and_finished() {
        let server = UdpSocket::bind("127.0.0.1:0").expect("локальный сервер");
        let address = server.local_addr().expect("адрес сервера").to_string();

        let responder = std::thread::spawn(move || {
            let mut buffer = [0u8; 2048];
            let (size, peer) = server.recv_from(&mut buffer).expect("запрос");
            let request = Message::from_vec(&buffer[..size]).expect("запрос разобран");
            let mut reply = Message::response(request.metadata.id, OpCode::Query);
            reply.metadata.response_code = ResponseCode::NoError;
            reply.add_answer(Record::from_rdata(
                Name::from_utf8("example.com.").expect("имя"),
                60,
                hickory_proto::rr::RData::A(A::new(192, 0, 2, 1)),
            ));
            server
                .send_to(&reply.to_vec().expect("ответ"), peer)
                .expect("отправка");
        });

        let bus = MessageBus::new(Deps::new());
        DnsLookupModule::new().register(&bus);

        let (tx_result, rx_result) = mpsc::channel();
        bus.subscribe_event::<DnsResult>(move |event, _deps| {
            let _ = tx_result.send((
                event.status,
                event.query_id.clone(),
                event.answers.first().map(|answer| answer.value.clone()),
            ));
        });
        let (tx_done, rx_done) = mpsc::channel();
        bus.subscribe_event::<DnsFinished>(move |event, _deps| {
            let _ = tx_done.send((event.completed, event.cancelled));
        });

        bus.start();
        let accepted = bus
            .ask(
                DnsRun::TOPIC,
                DnsRunAccepted::TOPIC,
                json!({
                    "run_id": "run-test",
                    "queries": [{
                        "query_id": "r1:test",
                        "row_id": "r1",
                        "server_id": "test",
                        "name": "example.com",
                        "type": "A"
                    }],
                    "servers": [{ "id": "test", "address": address }]
                }),
                Duration::from_secs(3),
            )
            .expect("ответ на запуск");

        assert_eq!(accepted["accepted"], true);
        assert_eq!(accepted["query_count"], 1);

        let (status, query_id, value) = rx_result
            .recv_timeout(Duration::from_secs(5))
            .expect("результат");
        assert_eq!(status, "ok");
        assert_eq!(query_id, "r1:test");
        assert_eq!(value.as_deref(), Some("192.0.2.1"));

        let (completed, cancelled) = rx_done
            .recv_timeout(Duration::from_secs(5))
            .expect("завершение");
        assert_eq!(completed, 1);
        assert!(!cancelled);

        responder.join().expect("ответчик завершился");
        bus.stop();
    }

    #[test]
    fn cancelled_query_is_not_published() {
        let query = PreparedQuery {
            query_id: "r1:test".to_owned(),
            row_id: "r1".to_owned(),
            server_id: "test".to_owned(),
            name: Name::from_utf8("example.com.").expect("имя"),
            record_type: hickory_proto::rr::RecordType::A,
            target: Target::Address("127.0.0.1:53".parse().expect("адрес")),
        };
        let cancelled = AtomicBool::new(true);
        assert!(run_query("run", &query, &[], &None, &cancelled).is_none());
    }

    #[test]
    fn empty_run_is_rejected() {
        let bus = MessageBus::new(Deps::new());
        DnsLookupModule::new().register(&bus);
        bus.start();

        let accepted = bus
            .ask(
                DnsRun::TOPIC,
                DnsRunAccepted::TOPIC,
                json!({
                    "run_id": "run-test",
                    "queries": [],
                    "servers": []
                }),
                Duration::from_secs(2),
            )
            .expect("ответ на запуск");

        assert_eq!(accepted["accepted"], false);
        assert!(
            accepted["error"]["code"].is_string(),
            "код ошибки обязателен"
        );
        bus.stop();
    }

    #[test]
    fn custom_servers_roundtrip_through_bus() {
        let dir =
            std::env::temp_dir().join(format!("toolbox-dnslookup-bus-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);

        let deps = Deps::new();
        deps.add(Arc::new(Storage::at(&dir)));
        let bus = MessageBus::new(deps);
        DnsLookupModule::new().register(&bus);
        bus.start();

        let saved = bus
            .ask(
                ServersSave::TOPIC,
                ServersSaveReply::TOPIC,
                json!({
                    "servers": [{ "id": "one", "label": "Свой", "address": "8.8.8.8" }]
                }),
                Duration::from_secs(2),
            )
            .expect("ответ на запись");
        assert_eq!(saved["saved"], true, "текст: {saved}");
        assert!(saved["error"].is_null());

        let loaded = bus
            .ask(
                ServersLoad::TOPIC,
                ServersLoadReply::TOPIC,
                json!({}),
                Duration::from_secs(2),
            )
            .expect("ответ на чтение");
        assert!(loaded["error"].is_null());
        assert_eq!(loaded["servers"][0]["address"], "8.8.8.8:53");

        bus.stop();
    }
}

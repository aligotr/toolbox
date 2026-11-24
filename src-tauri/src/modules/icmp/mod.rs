//! Подсистема проверки отклика по ICMP.
//!
//! Принимает запрос с целями, разрешает имена один раз, затем отправляет
//! пакеты по расписанию и публикует результат каждого пакета. Шина занята
//! только приёмом запроса и публикацией: сеть и разрешение имён работают
//! в отдельных потоках, поэтому интерфейс остаётся отзывчивым (ADR 0016).
//!
//! Период считается от отправки предыдущего пакета одной цели: так ведёт
//! себя системный `ping`. Адреса одной цели проверяются параллельно, а общий
//! статус цели интерфейс считает по всем её пакетам (ADR 0068).
//!
//! Модуль не пишет в лог: ошибки уходят либо в ответ на запуск, либо
//! в события результата. Это правило подсистем (ADR 0012).

mod request;
mod resolve;
mod transport;

use std::collections::{HashMap, VecDeque};
use std::net::IpAddr;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::core::infra::bus::MessageBus;
use crate::core::infra::error::AppError;
use crate::core::infra::module::Module;

use request::{
    AddressDto, ENDLESS_COUNT, IcmpCancel, IcmpFinished, IcmpPacket, IcmpResolved, IcmpRun,
    IcmpRunAccepted, MAX_ADDRESSES, PreparedRun, PreparedTarget,
};
use resolve::{ResolveOutcome, SystemResolver, TargetResolver};
use transport::{CheckAddress, EchoReply, EchoStatus, EchoTransport, platform_transport};

/// Число одновременных пакетов. Шестнадцать потоков закрывают типичный
/// список целей, не забивая сеть и не упираясь в предел системы.
const WORKERS: usize = 16;

/// Число одновременных разрешений имён: `getaddrinfo` иногда думает секунды.
const RESOLVE_WORKERS: usize = 8;

/// Шаг проверки отмены во время паузы между пакетами.
const CANCEL_SLICE: Duration = Duration::from_millis(25);

/// Реестр активных проверок: по `run_id` хранится флаг отмены.
type ActiveRuns = Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>;

/// Модуль проверки ICMP.
pub struct IcmpModule {
    runs: ActiveRuns,
    transport: Arc<dyn EchoTransport>,
    resolver: Arc<dyn TargetResolver>,
}

impl IcmpModule {
    /// Создаёт модуль с транспортом и резолвером платформы.
    pub fn new() -> Self {
        Self {
            runs: Arc::new(Mutex::new(HashMap::new())),
            transport: platform_transport(),
            resolver: Arc::new(SystemResolver),
        }
    }
}

impl Default for IcmpModule {
    fn default() -> Self {
        Self::new()
    }
}

impl Module for IcmpModule {
    fn id(&self) -> &'static str {
        "icmp"
    }

    fn register(&self, bus: &MessageBus) {
        bus.register_event_route::<IcmpRun>();

        let bus_for_run = bus.clone();
        let runs_for_run = self.runs.clone();
        let transport_for_run = self.transport.clone();
        let resolver_for_run = self.resolver.clone();
        bus.subscribe_event::<IcmpRun>(move |event, _deps| {
            let accepted = start_run(
                &bus_for_run,
                &runs_for_run,
                &transport_for_run,
                &resolver_for_run,
                event,
            );
            bus_for_run.publish_event(accepted);
        });

        let runs_for_cancel = self.runs.clone();
        bus.subscribe_command::<IcmpCancel>(move |command, _deps| {
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
        .expect("не удалось зарегистрировать команду icmp:cancel");
    }
}

/// Проверяет запрос, ставит его в реестр и запускает выполнение.
fn start_run(
    bus: &MessageBus,
    runs: &ActiveRuns,
    transport: &Arc<dyn EchoTransport>,
    resolver: &Arc<dyn TargetResolver>,
    event: &IcmpRun,
) -> IcmpRunAccepted {
    let accepted = |accepted: bool, target_count: usize, error: Option<AppError>| IcmpRunAccepted {
        run_id: event.run_id.clone(),
        accepted,
        target_count,
        error,
        correlation_id: event.correlation_id.clone(),
    };

    let run = match request::prepare(event) {
        Ok(run) => run,
        Err(error) => return accepted(false, 0, Some(error)),
    };

    let target_count = run.targets.len();
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
                        "errors.icmp.runExists",
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
                    "errors.icmp.registry",
                    "Реестр проверок недоступен",
                )),
            );
        }
    }

    let bus = bus.clone();
    let runs = runs.clone();
    let transport = transport.clone();
    let resolver = resolver.clone();
    std::thread::spawn(move || {
        execute(bus, runs, run, transport, resolver, cancelled);
    });

    accepted(true, target_count, None)
}

/// Выполняет проверку: разрешение имён, пакеты, завершение.
fn execute(
    bus: MessageBus,
    runs: ActiveRuns,
    run: PreparedRun,
    transport: Arc<dyn EchoTransport>,
    resolver: Arc<dyn TargetResolver>,
    cancelled: Arc<AtomicBool>,
) {
    let started = Instant::now();
    let resolved = resolve_targets(&run, resolver.as_ref());

    for target in &resolved {
        bus.publish_event(resolved_event(&run.run_id, target));
    }

    let jobs: Vec<AddressJob> = resolved
        .iter()
        .enumerate()
        .flat_map(|(index, target)| {
            target
                .outcome
                .addresses
                .iter()
                .map(move |address| AddressJob {
                    target_id: index,
                    address: *address,
                })
        })
        .collect();
    let address_count = jobs.len();

    let mut error = None;
    let (sent, received) = if address_count > MAX_ADDRESSES {
        // Молча обрезать список нельзя: пользователь проверял бы не то,
        // что видит. Отказ приходит событием завершения.
        error = Some(
            AppError::new(
                "errors.icmp.tooManyAddresses",
                format!("После разрешения имён получилось {address_count} адресов"),
            )
            .with("limit", MAX_ADDRESSES)
            .with("count", address_count),
        );
        (0, 0)
    } else {
        run_packets(&bus, &run, jobs, &transport, &cancelled)
    };

    bus.publish_event(IcmpFinished {
        run_id: run.run_id.clone(),
        cancelled: cancelled.load(Ordering::SeqCst),
        elapsed_ms: started.elapsed().as_millis() as u64,
        targets: run.targets.len(),
        addresses: address_count,
        sent,
        received,
        error,
    });

    // Отравленный реестр не отменяет завершение: проверка уже отработала.
    let _ = runs.lock().map(|mut active| {
        active.remove(&run.run_id);
    });
}

/// Разрешённая цель: исходный ввод и найденные адреса.
#[derive(Debug, Clone)]
struct ResolvedTarget {
    target: PreparedTarget,
    outcome: ResolveOutcome,
}

/// Пакеты одной цели, которые выполняются одной очередью.
#[derive(Debug, Clone, Copy)]
struct AddressJob {
    target_id: usize,
    address: CheckAddress,
}

/// Разрешает все цели, не задерживая шину одной медленной.
fn resolve_targets(run: &PreparedRun, resolver: &dyn TargetResolver) -> Vec<ResolvedTarget> {
    let next = AtomicUsize::new(0);
    let slots: Mutex<Vec<Option<ResolvedTarget>>> = Mutex::new(vec![None; run.targets.len()]);
    let workers = RESOLVE_WORKERS.min(run.targets.len());

    std::thread::scope(|scope| {
        for _ in 0..workers {
            scope.spawn(|| {
                loop {
                    let index = next.fetch_add(1, Ordering::Relaxed);
                    let Some(target) = run.targets.get(index) else {
                        break;
                    };
                    let outcome = resolver.resolve(&target.input, target.family);
                    if let Ok(mut slots) = slots.lock() {
                        slots[index] = Some(ResolvedTarget {
                            target: target.clone(),
                            outcome,
                        });
                    }
                }
            });
        }
    });

    slots
        .into_inner()
        .unwrap_or_default()
        .into_iter()
        .flatten()
        .collect()
}

/// Событие разрешения одной цели.
fn resolved_event(run_id: &str, target: &ResolvedTarget) -> IcmpResolved {
    IcmpResolved {
        run_id: run_id.to_owned(),
        target_id: target.target.target_id.clone(),
        input: target.target.input.clone(),
        normalized: target.outcome.normalized.clone(),
        status: if target.outcome.resolved() {
            "ok"
        } else {
            "unresolved"
        },
        addresses: target
            .outcome
            .addresses
            .iter()
            .map(|address| address_dto(*address))
            .collect(),
        error: target.outcome.error.clone(),
    }
}

/// Представление адреса в событиях.
fn address_dto(address: CheckAddress) -> AddressDto {
    AddressDto {
        address: address.ip.to_string(),
        family: family_of(address.ip),
        scope_id: address.scope_id,
    }
}

/// Семейство адреса проводным значением.
fn family_of(address: IpAddr) -> &'static str {
    if address.is_ipv4() { "ipv4" } else { "ipv6" }
}

/// Отправляет пакеты всех адресов и возвращает счётчики.
fn run_packets(
    bus: &MessageBus,
    run: &PreparedRun,
    jobs: Vec<AddressJob>,
    transport: &Arc<dyn EchoTransport>,
    cancelled: &Arc<AtomicBool>,
) -> (usize, usize) {
    let queue = Arc::new(Mutex::new(VecDeque::from(jobs)));
    let sent = Arc::new(AtomicUsize::new(0));
    let received = Arc::new(AtomicUsize::new(0));

    let workers = WORKERS.min(queue.lock().map(|jobs| jobs.len()).unwrap_or_default());
    let mut handles = Vec::with_capacity(workers);
    for _ in 0..workers {
        let bus = bus.clone();
        let queue = queue.clone();
        let sent = sent.clone();
        let received = received.clone();
        let cancelled = cancelled.clone();
        let transport = transport.clone();
        let run_id = run.run_id.clone();
        let period = run.period;
        let count = run.count;
        let timeout = run.timeout;
        let target_ids: Vec<String> = run
            .targets
            .iter()
            .map(|target| target.target_id.clone())
            .collect();

        handles.push(std::thread::spawn(move || {
            while !cancelled.load(Ordering::SeqCst) {
                // Отравленная очередь означает панику другого рабочего:
                // новые пакеты не берутся, но поток завершается штатно.
                let job = match queue.lock() {
                    Ok(mut queue) => queue.pop_front(),
                    Err(_) => break,
                };
                let Some(job) = job else {
                    break;
                };
                let Some(target_id) = target_ids.get(job.target_id) else {
                    continue;
                };
                send_series(
                    &bus,
                    &run_id,
                    target_id,
                    job.address,
                    period,
                    count,
                    timeout,
                    transport.as_ref(),
                    &cancelled,
                    &sent,
                    &received,
                );
            }
        }));
    }

    for handle in handles {
        let _ = handle.join();
    }

    (
        sent.load(Ordering::Relaxed),
        received.load(Ordering::Relaxed),
    )
}

/// Отправляет все пакеты одного адреса с заданным периодом.
#[allow(clippy::too_many_arguments)]
fn send_series(
    bus: &MessageBus,
    run_id: &str,
    target_id: &str,
    address: CheckAddress,
    period: Duration,
    count: u32,
    timeout: Duration,
    transport: &dyn EchoTransport,
    cancelled: &AtomicBool,
    sent: &AtomicUsize,
    received: &AtomicUsize,
) {
    let mut sequence: u32 = 1;
    loop {
        if cancelled.load(Ordering::SeqCst) {
            return;
        }

        let at_ms = epoch_ms();
        let started = Instant::now();
        let reply = transport.echo(address, timeout, sequence);

        // Результат, полученный уже после отмены, не публикуется: интерфейс
        // помечает недосчитанные пакеты как отменённые.
        if cancelled.load(Ordering::SeqCst) {
            return;
        }

        let packet = packet_event(run_id, target_id, address, sequence, at_ms, &reply);
        sent.fetch_add(1, Ordering::Relaxed);
        if reply.status == EchoStatus::Ok {
            received.fetch_add(1, Ordering::Relaxed);
        }
        bus.publish_event(packet);

        // Повторять отказ API бессмысленно: причина не в сети, а в вызове.
        if reply.status == EchoStatus::Error {
            return;
        }

        // Ноль - серия без ограничения: её заканчивает только отмена.
        if count != ENDLESS_COUNT && sequence >= count {
            return;
        }

        let elapsed = started.elapsed();
        if elapsed < period {
            sleep_unless_cancelled(period - elapsed, cancelled);
        }
        sequence = sequence.wrapping_add(1);
    }
}

/// Собирает событие одного пакета.
fn packet_event(
    run_id: &str,
    target_id: &str,
    address: CheckAddress,
    sequence: u32,
    at_ms: u64,
    reply: &EchoReply,
) -> IcmpPacket {
    IcmpPacket {
        run_id: run_id.to_owned(),
        target_id: target_id.to_owned(),
        address: address.ip.to_string(),
        family: family_of(address.ip),
        scope_id: address.scope_id,
        sequence,
        status: reply.status.as_str(),
        rtt_ms: reply.rtt.map(|rtt| rtt.as_millis() as u64),
        ttl: reply.ttl,
        at_ms,
        error: reply.error.clone().or_else(|| {
            (reply.status == EchoStatus::Error).then(|| {
                AppError::new(
                    "errors.icmp.echoFailed",
                    format!("Проверка {} не выполнена", address.ip),
                )
                .with("address", address.ip)
            })
        }),
    }
}

/// Ждёт паузу между пакетами, замечая отмену.
fn sleep_unless_cancelled(duration: Duration, cancelled: &AtomicBool) {
    let deadline = Instant::now() + duration;
    while !cancelled.load(Ordering::SeqCst) {
        let now = Instant::now();
        if now >= deadline {
            break;
        }
        std::thread::sleep((deadline - now).min(CANCEL_SLICE));
    }
}

/// Время отправки пакета, миллисекунды эпохи.
fn epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::infra::deps::Deps;
    use crate::core::infra::message::Message as _;
    use crate::modules::icmp::request::Family;
    use serde_json::json;
    use std::net::{Ipv4Addr, Ipv6Addr};
    use std::sync::mpsc;

    /// Транспорт, который записывает вызовы и отвечает без сети.
    struct FakeTransport {
        rtt: Duration,
        delay: Duration,
        calls: Mutex<Vec<(IpAddr, u32)>>,
    }

    impl FakeTransport {
        fn new(rtt: Duration, delay: Duration) -> Self {
            Self {
                rtt,
                delay,
                calls: Mutex::new(Vec::new()),
            }
        }

        fn call_count(&self) -> usize {
            self.calls.lock().map(|calls| calls.len()).unwrap_or(0)
        }
    }

    impl EchoTransport for FakeTransport {
        fn echo(&self, address: CheckAddress, _timeout: Duration, sequence: u32) -> EchoReply {
            if !self.delay.is_zero() {
                std::thread::sleep(self.delay);
            }
            if let Ok(mut calls) = self.calls.lock() {
                calls.push((address.ip, sequence));
            }
            EchoReply::ok(self.rtt, Some(64))
        }
    }

    /// Резолвер, который знает только заданные имена.
    struct FakeResolver {
        entries: HashMap<String, Vec<CheckAddress>>,
    }

    impl FakeResolver {
        fn new(entries: Vec<(&str, Vec<CheckAddress>)>) -> Self {
            Self {
                entries: entries
                    .into_iter()
                    .map(|(name, addresses)| (name.to_owned(), addresses))
                    .collect(),
            }
        }
    }

    impl TargetResolver for FakeResolver {
        fn resolve(&self, input: &str, _family: Family) -> ResolveOutcome {
            match self.entries.get(input) {
                Some(addresses) => ResolveOutcome {
                    normalized: None,
                    addresses: addresses.clone(),
                    error: None,
                },
                None => ResolveOutcome::failed(AppError::new(
                    "errors.icmp.noAddresses",
                    format!("У {input} нет адресов"),
                )),
            }
        }
    }

    fn module(transport: Arc<dyn EchoTransport>, resolver: Arc<dyn TargetResolver>) -> IcmpModule {
        IcmpModule {
            runs: Arc::new(Mutex::new(HashMap::new())),
            transport,
            resolver,
        }
    }

    fn run_payload(targets: serde_json::Value, period_ms: u64, count: u32) -> serde_json::Value {
        json!({
            "run_id": "run-1",
            "targets": targets,
            "period_ms": period_ms,
            "count": count,
            "timeout_ms": 1000
        })
    }

    fn local_addresses() -> Vec<CheckAddress> {
        vec![
            CheckAddress::new(IpAddr::V4(Ipv4Addr::LOCALHOST)),
            CheckAddress::new(IpAddr::V6(Ipv6Addr::LOCALHOST)),
        ]
    }

    #[test]
    fn run_publishes_packets_and_finished() {
        let transport = Arc::new(FakeTransport::new(Duration::from_millis(3), Duration::ZERO));
        let resolver = Arc::new(FakeResolver::new(vec![("example.test", local_addresses())]));
        let bus = MessageBus::new(Deps::new());
        module(transport.clone(), resolver).register(&bus);

        let (tx_resolved, rx_resolved) = mpsc::channel();
        bus.subscribe_event::<IcmpResolved>(move |event, _deps| {
            let _ = tx_resolved.send((
                event.status,
                event.addresses.len(),
                event.normalized.clone(),
            ));
        });
        let (tx_packet, rx_packet) = mpsc::channel();
        bus.subscribe_event::<IcmpPacket>(move |event, _deps| {
            let _ = tx_packet.send((
                event.status,
                event.ttl,
                event.rtt_ms,
                event.sequence,
                event.family,
            ));
        });
        let (tx_finished, rx_finished) = mpsc::channel();
        bus.subscribe_event::<IcmpFinished>(move |event, _deps| {
            let _ = tx_finished.send((
                event.cancelled,
                event.addresses,
                event.sent,
                event.received,
                event.elapsed_ms,
                event.error.as_ref().map(|error| error.code.clone()),
            ));
        });

        bus.start();
        let accepted = bus
            .ask(
                IcmpRun::TOPIC,
                IcmpRunAccepted::TOPIC,
                run_payload(
                    json!([{ "target_id": "t1", "input": "example.test", "family": "auto" }]),
                    200,
                    2,
                ),
                Duration::from_secs(2),
            )
            .expect("ответ на запуск");
        assert_eq!(accepted["accepted"], true);
        assert_eq!(accepted["target_count"], 1);

        let (status, address_count, normalized) = rx_resolved
            .recv_timeout(Duration::from_secs(2))
            .expect("разрешение");
        assert_eq!(status, "ok");
        assert_eq!(address_count, 2);
        assert!(normalized.is_none());

        let mut packets = Vec::new();
        while packets.len() < 4 {
            let packet = rx_packet
                .recv_timeout(Duration::from_secs(5))
                .expect("пакет");
            packets.push(packet);
        }
        assert!(packets.iter().all(|packet| packet.0 == "ok"));
        assert!(packets.iter().all(|packet| packet.1 == Some(64)));
        assert!(packets.iter().all(|packet| packet.2 == Some(3)));
        assert_eq!(
            packets
                .iter()
                .filter(|packet| packet.4 == "ipv4")
                .map(|packet| packet.3)
                .collect::<Vec<_>>(),
            vec![1, 2]
        );

        let (cancelled, addresses, sent, received, elapsed_ms, error) = rx_finished
            .recv_timeout(Duration::from_secs(5))
            .expect("завершение");
        assert!(!cancelled);
        assert_eq!(addresses, 2);
        assert_eq!(sent, 4);
        assert_eq!(received, 4);
        assert!(error.is_none());
        // Период обязан разделять пакеты одной цели.
        assert!(elapsed_ms >= 190, "длительность: {elapsed_ms}");
        assert_eq!(transport.call_count(), 4);

        bus.stop();
    }

    #[test]
    fn cancel_stops_remaining_packets() {
        let transport = Arc::new(FakeTransport::new(
            Duration::from_millis(2),
            Duration::from_millis(50),
        ));
        let resolver = Arc::new(FakeResolver::new(vec![("example.test", local_addresses())]));
        let bus = MessageBus::new(Deps::new());
        module(transport.clone(), resolver).register(&bus);

        let (tx_packet, rx_packet) = mpsc::channel();
        bus.subscribe_event::<IcmpPacket>(move |event, _deps| {
            let _ = tx_packet.send(event.sequence);
        });
        let (tx_finished, rx_finished) = mpsc::channel();
        bus.subscribe_event::<IcmpFinished>(move |event, _deps| {
            let _ = tx_finished.send((event.cancelled, event.sent));
        });

        bus.start();
        let accepted = bus
            .ask(
                IcmpRun::TOPIC,
                IcmpRunAccepted::TOPIC,
                run_payload(
                    json!([{ "target_id": "t1", "input": "example.test", "family": "auto" }]),
                    200,
                    100,
                ),
                Duration::from_secs(2),
            )
            .expect("ответ на запуск");
        assert_eq!(accepted["accepted"], true);

        rx_packet
            .recv_timeout(Duration::from_secs(2))
            .expect("первый пакет");
        bus.dispatch_command(IcmpCancel::TOPIC, json!({ "run_id": "run-1" }))
            .expect("команда отмены");

        let (cancelled, sent) = rx_finished
            .recv_timeout(Duration::from_secs(3))
            .expect("завершение");
        assert!(cancelled);
        assert!(sent < 200, "отправлено: {sent}");

        bus.stop();
    }

    #[test]
    fn endless_run_stops_on_cancel() {
        let transport = Arc::new(FakeTransport::new(
            Duration::from_millis(2),
            Duration::from_millis(50),
        ));
        let resolver = Arc::new(FakeResolver::new(vec![("example.test", local_addresses())]));
        let bus = MessageBus::new(Deps::new());
        module(transport.clone(), resolver).register(&bus);

        let (tx_packet, rx_packet) = mpsc::channel();
        bus.subscribe_event::<IcmpPacket>(move |event, _deps| {
            let _ = tx_packet.send(event.sequence);
        });
        let (tx_finished, rx_finished) = mpsc::channel();
        bus.subscribe_event::<IcmpFinished>(move |event, _deps| {
            let _ = tx_finished.send((event.cancelled, event.sent));
        });

        bus.start();
        let accepted = bus
            .ask(
                IcmpRun::TOPIC,
                IcmpRunAccepted::TOPIC,
                run_payload(
                    json!([{ "target_id": "t1", "input": "example.test", "family": "auto" }]),
                    200,
                    0,
                ),
                Duration::from_secs(2),
            )
            .expect("ответ на запуск");
        assert_eq!(accepted["accepted"], true);

        rx_packet
            .recv_timeout(Duration::from_secs(2))
            .expect("первый пакет");
        bus.dispatch_command(IcmpCancel::TOPIC, json!({ "run_id": "run-1" }))
            .expect("команда отмены");

        let (cancelled, sent) = rx_finished
            .recv_timeout(Duration::from_secs(3))
            .expect("завершение");
        assert!(cancelled);
        assert!(sent >= 1, "отправлено: {sent}");

        bus.stop();
    }

    #[test]
    fn duplicate_run_id_is_rejected() {
        let transport = Arc::new(FakeTransport::new(
            Duration::from_millis(2),
            Duration::from_millis(300),
        ));
        let resolver = Arc::new(FakeResolver::new(vec![("example.test", local_addresses())]));
        let bus = MessageBus::new(Deps::new());
        module(transport, resolver).register(&bus);
        bus.start();

        let payload = run_payload(
            json!([{ "target_id": "t1", "input": "example.test", "family": "auto" }]),
            200,
            5,
        );
        let first = bus
            .ask(
                IcmpRun::TOPIC,
                IcmpRunAccepted::TOPIC,
                payload.clone(),
                Duration::from_secs(2),
            )
            .expect("первый запуск");
        assert_eq!(first["accepted"], true);

        let second = bus
            .ask(
                IcmpRun::TOPIC,
                IcmpRunAccepted::TOPIC,
                payload,
                Duration::from_secs(2),
            )
            .expect("второй запуск");
        assert_eq!(second["accepted"], false);
        assert_eq!(second["error"]["code"], "errors.icmp.runExists");

        bus.stop();
    }

    #[test]
    fn unresolved_target_finishes_without_packets() {
        let transport = Arc::new(FakeTransport::new(Duration::from_millis(2), Duration::ZERO));
        let resolver = Arc::new(FakeResolver::new(Vec::new()));
        let bus = MessageBus::new(Deps::new());
        module(transport.clone(), resolver).register(&bus);

        let (tx_resolved, rx_resolved) = mpsc::channel();
        bus.subscribe_event::<IcmpResolved>(move |event, _deps| {
            let _ = tx_resolved.send((event.status, event.error.is_some()));
        });
        let (tx_finished, rx_finished) = mpsc::channel();
        bus.subscribe_event::<IcmpFinished>(move |event, _deps| {
            let _ = tx_finished.send((event.addresses, event.sent));
        });

        bus.start();
        bus.ask(
            IcmpRun::TOPIC,
            IcmpRunAccepted::TOPIC,
            run_payload(
                json!([{ "target_id": "t1", "input": "missing.test", "family": "auto" }]),
                200,
                2,
            ),
            Duration::from_secs(2),
        )
        .expect("ответ на запуск");

        let (status, has_error) = rx_resolved
            .recv_timeout(Duration::from_secs(2))
            .expect("разрешение");
        assert_eq!(status, "unresolved");
        assert!(has_error);

        let (addresses, sent) = rx_finished
            .recv_timeout(Duration::from_secs(2))
            .expect("завершение");
        assert_eq!(addresses, 0);
        assert_eq!(sent, 0);
        assert_eq!(transport.call_count(), 0);

        bus.stop();
    }

    #[test]
    fn too_many_addresses_finish_with_error() {
        let transport = Arc::new(FakeTransport::new(Duration::from_millis(2), Duration::ZERO));
        let addresses: Vec<CheckAddress> = (0..=MAX_ADDRESSES)
            .map(|index| {
                CheckAddress::new(IpAddr::V4(Ipv4Addr::new(
                    10,
                    0,
                    (index / 256) as u8,
                    (index % 256) as u8,
                )))
            })
            .collect();
        let resolver = Arc::new(FakeResolver::new(vec![("many.test", addresses)]));
        let bus = MessageBus::new(Deps::new());
        module(transport.clone(), resolver).register(&bus);

        let (tx_finished, rx_finished) = mpsc::channel();
        bus.subscribe_event::<IcmpFinished>(move |event, _deps| {
            let _ = tx_finished.send((
                event.sent,
                event.error.as_ref().map(|error| error.code.clone()),
            ));
        });

        bus.start();
        bus.ask(
            IcmpRun::TOPIC,
            IcmpRunAccepted::TOPIC,
            run_payload(
                json!([{ "target_id": "t1", "input": "many.test", "family": "auto" }]),
                200,
                1,
            ),
            Duration::from_secs(2),
        )
        .expect("ответ на запуск");

        let (sent, error) = rx_finished
            .recv_timeout(Duration::from_secs(2))
            .expect("завершение");
        assert_eq!(error.as_deref(), Some("errors.icmp.tooManyAddresses"));
        assert_eq!(sent, 0);
        assert_eq!(transport.call_count(), 0);

        bus.stop();
    }

    #[test]
    fn packet_event_carries_error_for_platform_failure() {
        let address = CheckAddress::new(IpAddr::V4(Ipv4Addr::LOCALHOST));
        let reply = EchoReply::error(AppError::new(
            "errors.icmp.unsupportedPlatform",
            "Проверка ICMP недоступна",
        ));

        let packet = packet_event("run-1", "t1", address, 3, 42, &reply);

        assert_eq!(packet.status, "error");
        assert_eq!(packet.sequence, 3);
        assert_eq!(packet.at_ms, 42);
        assert_eq!(
            packet.error.expect("причина").code,
            "errors.icmp.unsupportedPlatform"
        );
    }
}

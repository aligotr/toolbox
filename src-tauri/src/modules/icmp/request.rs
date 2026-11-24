//! Запрос проверки ICMP и структуры протокола шины.
//!
//! Здесь описано всё, что приходит из интерфейса и уходит обратно, и проверка
//! этих данных. Транспорт и разрешение имён живут отдельно: проверка запроса
//! не должна зависеть от сокетов, иначе её нельзя испытать без сети.
//!
//! Проверка дублирует ограничения интерфейса намеренно: UI может ошибиться
//! или быть заменён, а лимиты - свойство подсистемы, а не кнопки. Пределы
//! задаёт ADR 0068.

use std::collections::BTreeSet;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::core::infra::error::{AppError, AppResult, fail};
use crate::core::infra::message::{Command, Event, Message};

/// Предел числа целей в одной проверке.
pub const MAX_TARGETS: usize = 64;

/// Предел числа адресов проверки после разрешения имён.
pub const MAX_ADDRESSES: usize = 128;

/// Нижняя граница периода между пакетами одной цели.
pub const MIN_PERIOD_MS: u64 = 200;

/// Верхняя граница периода между пакетами одной цели.
pub const MAX_PERIOD_MS: u64 = 60_000;

/// Нижняя граница числа пакетов на адрес.
pub const MIN_COUNT: u32 = 1;

/// Верхняя граница числа пакетов на адрес.
pub const MAX_COUNT: u32 = 100;

/// Значение «без ограничения»: серия идёт до отмены.
pub const ENDLESS_COUNT: u32 = 0;

/// Нижняя граница таймаута одного пакета.
pub const MIN_TIMEOUT_MS: u64 = 200;

/// Верхняя граница таймаута одного пакета.
pub const MAX_TIMEOUT_MS: u64 = 10_000;

/// Семейство адресов, которое выбирает пользователь.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Family {
    /// Все найденные адреса: IPv4 и IPv6.
    #[default]
    Auto,
    /// Только IPv4.
    Ipv4,
    /// Только IPv6.
    Ipv6,
}

impl Family {
    /// Проводное значение для интерфейса.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::Ipv4 => "ipv4",
            Self::Ipv6 => "ipv6",
        }
    }

    /// Подходит ли семейству конкретный адрес.
    pub fn accepts(self, address: &std::net::IpAddr) -> bool {
        match self {
            Self::Auto => true,
            Self::Ipv4 => address.is_ipv4(),
            Self::Ipv6 => address.is_ipv6(),
        }
    }
}

/// Запрос на проверку.
#[derive(Debug, Deserialize, Serialize)]
pub struct IcmpRun {
    pub run_id: String,
    pub targets: Vec<TargetSpec>,
    pub period_ms: u64,
    pub count: u32,
    pub timeout_ms: u64,
    #[serde(default)]
    pub correlation_id: Option<String>,
}

impl Message for IcmpRun {
    const TOPIC: &'static str = "icmp:run";
}

impl Event for IcmpRun {}

/// Одна цель проверки: то, что ввёл пользователь, и выбранное семейство.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TargetSpec {
    pub target_id: String,
    pub input: String,
    #[serde(default)]
    pub family: Family,
}

/// Ответ на запуск: принято или отклонено.
#[derive(Debug, Serialize)]
pub struct IcmpRunAccepted {
    pub run_id: String,
    pub accepted: bool,
    pub target_count: usize,
    pub error: Option<AppError>,
    pub correlation_id: Option<String>,
}

impl Message for IcmpRunAccepted {
    const TOPIC: &'static str = "icmp:run:accepted";
}

impl Event for IcmpRunAccepted {}

/// Один адрес проверки в событии разрешения.
#[derive(Debug, Clone, Serialize)]
pub struct AddressDto {
    pub address: String,
    pub family: &'static str,
    pub scope_id: u32,
}

/// Итог разрешения имени цели.
#[derive(Debug, Serialize)]
pub struct IcmpResolved {
    pub run_id: String,
    pub target_id: String,
    pub input: String,
    /// ASCII-форма имени, если её пришлось получить.
    pub normalized: Option<String>,
    /// `ok` или `unresolved`.
    pub status: &'static str,
    pub addresses: Vec<AddressDto>,
    pub error: Option<AppError>,
}

impl Message for IcmpResolved {
    const TOPIC: &'static str = "icmp:resolved";
}

impl Event for IcmpResolved {}

/// Результат одного пакета.
#[derive(Debug, Serialize)]
pub struct IcmpPacket {
    pub run_id: String,
    pub target_id: String,
    pub address: String,
    pub family: &'static str,
    pub scope_id: u32,
    pub sequence: u32,
    /// Проводное значение статуса: `ok`, `timeout`, `unreachable`, `error`.
    pub status: &'static str,
    pub rtt_ms: Option<u64>,
    pub ttl: Option<u8>,
    /// Время отправки, миллисекунды эпохи.
    pub at_ms: u64,
    pub error: Option<AppError>,
}

impl Message for IcmpPacket {
    const TOPIC: &'static str = "icmp:packet";
}

impl Event for IcmpPacket {}

/// Завершение проверки.
#[derive(Debug, Serialize)]
pub struct IcmpFinished {
    pub run_id: String,
    pub cancelled: bool,
    pub elapsed_ms: u64,
    pub targets: usize,
    pub addresses: usize,
    pub sent: usize,
    pub received: usize,
    /// Отказ, который остановил проверку до пакетов: например, слишком
    /// много адресов после разрешения.
    pub error: Option<AppError>,
}

impl Message for IcmpFinished {
    const TOPIC: &'static str = "icmp:finished";
}

impl Event for IcmpFinished {}

/// Команда остановки проверки.
#[derive(Debug, Deserialize)]
pub struct IcmpCancel {
    pub run_id: String,
}

impl Message for IcmpCancel {
    const TOPIC: &'static str = "icmp:cancel";
}

impl Command for IcmpCancel {}

/// Проверенная цель, готовая к разрешению.
#[derive(Debug, Clone)]
pub struct PreparedTarget {
    pub target_id: String,
    pub input: String,
    pub family: Family,
}

/// Проверенная проверка целиком.
#[derive(Debug)]
pub struct PreparedRun {
    pub run_id: String,
    pub targets: Vec<PreparedTarget>,
    pub period: Duration,
    pub count: u32,
    pub timeout: Duration,
}

/// Проверяет запрос и превращает его в план выполнения.
pub fn prepare(run: &IcmpRun) -> AppResult<PreparedRun> {
    if run.run_id.trim().is_empty() {
        return fail!("errors.run.idMissing", "Не указан идентификатор проверки");
    }
    if run.targets.is_empty() {
        return fail!("errors.icmp.emptyTargets", "Список целей пуст");
    }
    if run.targets.len() > MAX_TARGETS {
        return fail!(
            "icmp.validate.targetLimit",
            format!("Целей больше предела в {MAX_TARGETS}"),
            limit = MAX_TARGETS,
        );
    }
    if !(MIN_PERIOD_MS..=MAX_PERIOD_MS).contains(&run.period_ms) {
        return fail!(
            "icmp.run.period",
            format!("Период вне пределов {MIN_PERIOD_MS}..{MAX_PERIOD_MS} мс"),
            min = MIN_PERIOD_MS,
            max = MAX_PERIOD_MS,
        );
    }
    if run.count != ENDLESS_COUNT && !(MIN_COUNT..=MAX_COUNT).contains(&run.count) {
        return fail!(
            "icmp.run.count",
            format!("Число проверок: от {MIN_COUNT} до {MAX_COUNT}"),
            min = MIN_COUNT,
            max = MAX_COUNT,
        );
    }
    if !(MIN_TIMEOUT_MS..=MAX_TIMEOUT_MS).contains(&run.timeout_ms) {
        return fail!(
            "icmp.run.timeout",
            format!("Таймаут вне пределов {MIN_TIMEOUT_MS}..{MAX_TIMEOUT_MS} мс"),
            min = MIN_TIMEOUT_MS,
            max = MAX_TIMEOUT_MS,
        );
    }

    let mut ids = BTreeSet::new();
    let mut targets = Vec::with_capacity(run.targets.len());
    for target in &run.targets {
        if target.target_id.trim().is_empty() {
            return fail!("errors.icmp.targetId", "Не указан идентификатор цели");
        }
        if target.input.trim().is_empty() {
            return fail!("errors.icmp.emptyTarget", "Пустая цель проверки");
        }
        if !ids.insert(target.target_id.as_str()) {
            return fail!(
                "errors.icmp.duplicateTarget",
                format!("Цель {} указана дважды", target.target_id),
                targetId = target.target_id.clone(),
            );
        }
        targets.push(PreparedTarget {
            target_id: target.target_id.clone(),
            input: target.input.trim().to_owned(),
            family: target.family,
        });
    }

    Ok(PreparedRun {
        run_id: run.run_id.clone(),
        targets,
        period: Duration::from_millis(run.period_ms),
        count: run.count,
        timeout: Duration::from_millis(run.timeout_ms),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec(id: &str, family: Family) -> TargetSpec {
        TargetSpec {
            target_id: id.to_owned(),
            input: "example.com".to_owned(),
            family,
        }
    }

    fn valid() -> IcmpRun {
        IcmpRun {
            run_id: "run-1".to_owned(),
            targets: vec![spec("t1", Family::Auto)],
            period_ms: 1_000,
            count: 4,
            timeout_ms: 1_000,
            correlation_id: None,
        }
    }

    #[test]
    fn accepts_valid_request() {
        let run = prepare(&valid()).expect("запрос принят");

        assert_eq!(run.run_id, "run-1");
        assert_eq!(run.targets.len(), 1);
        assert_eq!(run.period, Duration::from_millis(1000));
        assert_eq!(run.count, 4);
        assert_eq!(run.timeout, Duration::from_millis(1000));
    }

    #[test]
    fn rejects_empty_targets() {
        let mut run = valid();
        run.targets.clear();

        assert_eq!(
            prepare(&run).expect_err("пустой список").code,
            "errors.icmp.emptyTargets"
        );
    }

    #[test]
    fn rejects_too_many_targets() {
        let mut run = valid();
        run.targets = (0..=MAX_TARGETS)
            .map(|index| spec(&format!("t{index}"), Family::Auto))
            .collect();

        assert_eq!(
            prepare(&run).expect_err("слишком много целей").code,
            "icmp.validate.targetLimit"
        );
    }

    #[test]
    fn rejects_period_out_of_bounds() {
        for period_ms in [MIN_PERIOD_MS - 1, MAX_PERIOD_MS + 1] {
            let mut run = valid();
            run.period_ms = period_ms;

            assert_eq!(
                prepare(&run).expect_err("период вне пределов").code,
                "icmp.run.period"
            );
        }
    }

    #[test]
    fn rejects_count_out_of_bounds() {
        let mut run = valid();
        run.count = MAX_COUNT + 1;

        assert_eq!(
            prepare(&run).expect_err("количество вне пределов").code,
            "icmp.run.count"
        );
    }

    #[test]
    fn accepts_endless_count() {
        let mut run = valid();
        run.count = ENDLESS_COUNT;

        let prepared = prepare(&run).expect("бесконечная проверка принята");
        assert_eq!(prepared.count, ENDLESS_COUNT);
    }

    #[test]
    fn rejects_timeout_out_of_bounds() {
        for timeout_ms in [MIN_TIMEOUT_MS - 1, MAX_TIMEOUT_MS + 1] {
            let mut run = valid();
            run.timeout_ms = timeout_ms;

            assert_eq!(
                prepare(&run).expect_err("таймаут вне пределов").code,
                "icmp.run.timeout"
            );
        }
    }

    #[test]
    fn rejects_duplicate_target_id() {
        let mut run = valid();
        run.targets = vec![spec("t1", Family::Auto), spec("t1", Family::Ipv4)];

        assert_eq!(
            prepare(&run).expect_err("повтор идентификатора").code,
            "errors.icmp.duplicateTarget"
        );
    }

    #[test]
    fn rejects_blank_target() {
        let mut run = valid();
        run.targets[0].input = "   ".to_owned();

        assert_eq!(
            prepare(&run).expect_err("пустая цель").code,
            "errors.icmp.emptyTarget"
        );
    }

    #[test]
    fn trims_target_input() {
        let mut run = valid();
        run.targets[0].input = "  example.com  ".to_owned();

        let prepared = prepare(&run).expect("запрос принят");
        assert_eq!(prepared.targets[0].input, "example.com");
    }

    #[test]
    fn family_filters_addresses() {
        use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

        let v4 = IpAddr::V4(Ipv4Addr::LOCALHOST);
        let v6 = IpAddr::V6(Ipv6Addr::LOCALHOST);

        assert!(Family::Auto.accepts(&v4));
        assert!(Family::Auto.accepts(&v6));
        assert!(Family::Ipv4.accepts(&v4));
        assert!(!Family::Ipv4.accepts(&v6));
        assert!(Family::Ipv6.accepts(&v6));
        assert!(!Family::Ipv6.accepts(&v4));
    }
}

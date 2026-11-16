//! Запрос DNS-проверки и структуры протокола шины.
//!
//! Здесь описано всё, что приходит из интерфейса и уходит обратно, и проверка
//! этих данных. Транспорт и разбор ответа живут отдельно: валидация не должна
//! зависеть от сокетов, иначе её нельзя проверить без сети.
//!
//! Проверка дублирует ограничения интерфейса намеренно: UI может ошибиться
//! или быть заменён, а лимиты — свойство подсистемы, а не кнопки.

use std::net::{IpAddr, SocketAddr};
use std::str::FromStr;

use hickory_proto::rr::{Name, RecordType};
use serde::{Deserialize, Serialize};

use crate::core::infra::message::{Command, Event, Message};

use super::servers::StoredServer;

/// Предел числа запросов в одной проверке.
pub const MAX_QUERIES: usize = 500;

/// Предел числа серверов в одной проверке.
pub const MAX_SERVERS: usize = 8;

/// Порт DNS по умолчанию.
const DEFAULT_PORT: u16 = 53;

/// Запрос на проверку.
#[derive(Debug, Deserialize, Serialize)]
pub struct DnsRun {
    pub run_id: String,
    pub queries: Vec<QuerySpec>,
    pub servers: Vec<ServerSpec>,
    #[serde(default)]
    pub correlation_id: Option<String>,
}

impl Message for DnsRun {
    const TOPIC: &'static str = "dnslookup:run";
}

impl Event for DnsRun {}

/// Одна ячейка проверки: домен, тип и сервер.
#[derive(Debug, Deserialize, Serialize)]
pub struct QuerySpec {
    pub query_id: String,
    pub row_id: String,
    pub server_id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub record_type: String,
}

/// Сервер проверки: системный (`address = null`) или конкретный адрес.
#[derive(Debug, Deserialize, Serialize)]
pub struct ServerSpec {
    pub id: String,
    pub address: Option<String>,
}

/// Ответ на запуск: принято или отклонено.
#[derive(Debug, Serialize)]
pub struct DnsRunAccepted {
    pub run_id: String,
    pub accepted: bool,
    pub query_count: usize,
    pub error: Option<String>,
    pub correlation_id: Option<String>,
}

impl Message for DnsRunAccepted {
    const TOPIC: &'static str = "dnslookup:run:accepted";
}

impl Event for DnsRunAccepted {}

/// Результат одной ячейки.
#[derive(Debug, Serialize)]
pub struct DnsResult {
    pub run_id: String,
    pub query_id: String,
    pub row_id: String,
    pub server_id: String,
    /// Проводное значение статуса: `ok`, `nodata`, `nxdomain` и т. д.
    pub status: &'static str,
    pub answers: Vec<Answer>,
    pub elapsed_ms: Option<u64>,
    pub error: Option<String>,
}

impl Message for DnsResult {
    const TOPIC: &'static str = "dnslookup:result";
}

impl Event for DnsResult {}

/// Завершение проверки.
#[derive(Debug, Serialize)]
pub struct DnsFinished {
    pub run_id: String,
    pub completed: usize,
    pub cancelled: bool,
    pub elapsed_ms: u64,
}

impl Message for DnsFinished {
    const TOPIC: &'static str = "dnslookup:finished";
}

impl Event for DnsFinished {}

/// Команда остановки проверки.
#[derive(Debug, Deserialize)]
pub struct DnsCancel {
    pub run_id: String,
}

impl Message for DnsCancel {
    const TOPIC: &'static str = "dnslookup:cancel";
}

impl Command for DnsCancel {}

/// Запрос адресов системных резолверов.
#[derive(Debug, Deserialize, Serialize)]
pub struct SystemServersRequest {
    #[serde(default)]
    pub correlation_id: Option<String>,
}

impl Message for SystemServersRequest {
    const TOPIC: &'static str = "dnslookup:system:servers";
}

impl Event for SystemServersRequest {}

/// Ответ со списком системных резолверов.
#[derive(Debug, Serialize)]
pub struct SystemServersReply {
    pub servers: Vec<String>,
    pub error: Option<String>,
    pub correlation_id: Option<String>,
}

impl Message for SystemServersReply {
    const TOPIC: &'static str = "dnslookup:system:servers:reply";
}

impl Event for SystemServersReply {}

/// Запрос своих серверов профиля.
#[derive(Debug, Deserialize, Serialize)]
pub struct ServersLoad {
    #[serde(default)]
    pub correlation_id: Option<String>,
}

impl Message for ServersLoad {
    const TOPIC: &'static str = "dnslookup:servers:load";
}

impl Event for ServersLoad {}

/// Ответ со списком своих серверов.
#[derive(Debug, Serialize)]
pub struct ServersLoadReply {
    pub servers: Vec<StoredServer>,
    pub error: Option<String>,
    pub correlation_id: Option<String>,
}

impl Message for ServersLoadReply {
    const TOPIC: &'static str = "dnslookup:servers:load:reply";
}

impl Event for ServersLoadReply {}

/// Запрос записи своих серверов.
///
/// `servers` обязателен: пустой список стирает файл, и пропущенное поле
/// не должно делать это молча.
#[derive(Debug, Deserialize, Serialize)]
pub struct ServersSave {
    pub servers: Vec<StoredServer>,
    #[serde(default)]
    pub correlation_id: Option<String>,
}

impl Message for ServersSave {
    const TOPIC: &'static str = "dnslookup:servers:save";
}

impl Event for ServersSave {}

/// Ответ на запись своих серверов.
#[derive(Debug, Serialize)]
pub struct ServersSaveReply {
    pub saved: bool,
    pub error: Option<String>,
    pub correlation_id: Option<String>,
}

impl Message for ServersSaveReply {
    const TOPIC: &'static str = "dnslookup:servers:save:reply";
}

impl Event for ServersSaveReply {}

/// Одна запись в ответе DNS в формате зоны.
#[derive(Debug, Clone, Serialize)]
pub struct Answer {
    pub value: String,
    pub ttl: Option<u32>,
}

/// Куда отправлять запрос: конкретный адрес или системные резолверы.
#[derive(Debug, Clone, Copy)]
pub enum Target {
    Address(SocketAddr),
    System,
}

/// Проверенный запрос, готовый к выполнению.
#[derive(Debug)]
pub struct PreparedQuery {
    pub query_id: String,
    pub row_id: String,
    pub server_id: String,
    pub name: Name,
    pub record_type: RecordType,
    pub target: Target,
}

/// Проверенная проверка целиком.
#[derive(Debug)]
pub struct PreparedRun {
    pub run_id: String,
    pub queries: Vec<PreparedQuery>,
    /// Адреса системных резолверов, если среди серверов есть «Системный».
    pub system_addresses: Vec<SocketAddr>,
    /// Причина, по которой системные адреса не получены.
    pub system_error: Option<String>,
}

/// Проверяет запрос и превращает его в план выполнения.
pub fn prepare(run: &DnsRun) -> Result<PreparedRun, String> {
    if run.run_id.trim().is_empty() {
        return Err("Не указан идентификатор проверки".to_owned());
    }
    if run.queries.is_empty() {
        return Err("Список запросов пуст".to_owned());
    }
    if run.queries.len() > MAX_QUERIES {
        return Err(format!(
            "Слишком много запросов: {}, предел {MAX_QUERIES}",
            run.queries.len()
        ));
    }
    if run.servers.is_empty() {
        return Err("Не выбран ни один сервер".to_owned());
    }
    if run.servers.len() > MAX_SERVERS {
        return Err(format!(
            "Слишком много серверов: {}, предел {MAX_SERVERS}",
            run.servers.len()
        ));
    }

    let mut targets = Vec::with_capacity(run.servers.len());
    for server in &run.servers {
        let target = match &server.address {
            Some(address) => Target::Address(parse_server_address(address)?),
            None => Target::System,
        };
        if let Target::Address(address) = target {
            if targets.iter().any(|(_, existing)| match existing {
                Target::Address(other) => *other == address,
                Target::System => false,
            }) {
                return Err(format!("Сервер {address} указан дважды"));
            }
        }
        targets.push((server.id.as_str(), target));
    }

    let mut queries = Vec::with_capacity(run.queries.len());
    for query in &run.queries {
        let target = targets
            .iter()
            .find(|(id, _)| *id == query.server_id)
            .map(|(_, target)| *target)
            .ok_or_else(|| format!("Неизвестный сервер '{}'", query.server_id))?;
        let record_type = parse_record_type(&query.record_type)?;
        let name = normalize_name(&query.name, record_type)?;
        queries.push(PreparedQuery {
            query_id: query.query_id.clone(),
            row_id: query.row_id.clone(),
            server_id: query.server_id.clone(),
            name,
            record_type,
            target,
        });
    }

    Ok(PreparedRun {
        run_id: run.run_id.clone(),
        queries,
        system_addresses: Vec::new(),
        system_error: None,
    })
}

/// Разбирает тип записи из проводного значения.
pub fn parse_record_type(value: &str) -> Result<RecordType, String> {
    match value.trim().to_ascii_uppercase().as_str() {
        "A" => Ok(RecordType::A),
        "AAAA" => Ok(RecordType::AAAA),
        "CNAME" => Ok(RecordType::CNAME),
        "MX" => Ok(RecordType::MX),
        "TXT" => Ok(RecordType::TXT),
        "NS" => Ok(RecordType::NS),
        "SOA" => Ok(RecordType::SOA),
        "SRV" => Ok(RecordType::SRV),
        "CAA" => Ok(RecordType::CAA),
        "PTR" => Ok(RecordType::PTR),
        other => Err(format!("Неизвестный тип записи '{other}'")),
    }
}

/// Нормализует имя домена; для `PTR` разворачивает IP в reverse-имя.
pub fn normalize_name(input: &str, record_type: RecordType) -> Result<Name, String> {
    let text = input.trim();
    if text.is_empty() {
        return Err("Имя домена пустое".to_owned());
    }

    if record_type == RecordType::PTR {
        if let Ok(ip) = IpAddr::from_str(text) {
            return reverse_name(ip);
        }
    } else if IpAddr::from_str(text).is_ok() {
        return Err(format!(
            "Для типа {record_type} укажите доменное имя, а не IP-адрес"
        ));
    }

    let mut name =
        Name::from_utf8(text).map_err(|error| format!("Некорректное имя '{text}': {error}"))?;
    name.set_fqdn(true);
    Ok(name)
}

/// Строит reverse-имя для адреса: `in-addr.arpa` или `ip6.arpa`.
fn reverse_name(ip: IpAddr) -> Result<Name, String> {
    let text = match ip {
        IpAddr::V4(address) => {
            let mut labels: Vec<String> =
                address.octets().iter().rev().map(u8::to_string).collect();
            labels.push("in-addr.arpa".to_owned());
            labels.join(".")
        }
        IpAddr::V6(address) => {
            let mut labels: Vec<String> = address
                .octets()
                .iter()
                .flat_map(|byte| [byte >> 4, byte & 0x0f])
                .rev()
                .map(|nibble| format!("{nibble:x}"))
                .collect();
            labels.push("ip6.arpa".to_owned());
            labels.join(".")
        }
    };
    Name::from_ascii(format!("{text}."))
        .map_err(|error| format!("Не удалось построить reverse-имя: {error}"))
}

/// Разбирает адрес сервера: `IP`, `IP:порт`, `[IPv6]:порт`.
pub fn parse_server_address(input: &str) -> Result<SocketAddr, String> {
    let text = input.trim();
    if text.is_empty() {
        return Err("Адрес сервера пустой".to_owned());
    }

    let address = if let Ok(address) = SocketAddr::from_str(text) {
        address
    } else if let Ok(ip) = IpAddr::from_str(text) {
        SocketAddr::new(ip, DEFAULT_PORT)
    } else {
        return Err(format!("Некорректный адрес сервера '{text}'"));
    };

    if address.port() == 0 {
        return Err(format!("Некорректный порт в адресе '{text}'"));
    }
    Ok(address)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn query(id: &str, server: &str, name: &str, record_type: &str) -> QuerySpec {
        QuerySpec {
            query_id: format!("{id}:{server}"),
            row_id: id.to_owned(),
            server_id: server.to_owned(),
            name: name.to_owned(),
            record_type: record_type.to_owned(),
        }
    }

    fn run(queries: Vec<QuerySpec>, servers: Vec<ServerSpec>) -> DnsRun {
        DnsRun {
            run_id: "run-1".to_owned(),
            queries,
            servers,
            correlation_id: None,
        }
    }

    fn server(id: &str, address: Option<&str>) -> ServerSpec {
        ServerSpec {
            id: id.to_owned(),
            address: address.map(str::to_owned),
        }
    }

    #[test]
    fn idn_name_becomes_punycode() {
        let name = normalize_name("пример.рф", RecordType::A).expect("имя должно разобраться");
        assert_eq!(name.to_ascii(), "xn--e1afmkfd.xn--p1ai.");
    }

    #[test]
    fn ipv4_ptr_is_reversed() {
        let name =
            normalize_name("93.184.216.34", RecordType::PTR).expect("PTR должен развернуться");
        assert_eq!(name.to_ascii(), "34.216.184.93.in-addr.arpa.");
    }

    #[test]
    fn ipv6_ptr_is_reversed() {
        let name = normalize_name("2001:db8::1", RecordType::PTR).expect("PTR должен развернуться");
        assert_eq!(
            name.to_ascii(),
            "1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa."
        );
    }

    #[test]
    fn ip_with_regular_type_is_rejected() {
        let error = normalize_name("93.184.216.34", RecordType::A).expect_err("IP не домен");
        assert!(error.contains("доменное имя"), "текст ошибки: {error}");
    }

    #[test]
    fn server_address_uses_port_53_by_default() {
        assert_eq!(
            parse_server_address("8.8.8.8").expect("адрес"),
            "8.8.8.8:53".parse().expect("адрес")
        );
        assert_eq!(
            parse_server_address("2606:4700::1111").expect("адрес"),
            "[2606:4700::1111]:53".parse().expect("адрес")
        );
        assert_eq!(
            parse_server_address("[2606:4700::1111]:5353").expect("адрес"),
            "[2606:4700::1111]:5353".parse().expect("адрес")
        );
    }

    #[test]
    fn broken_server_address_is_rejected() {
        assert!(parse_server_address("не адрес").is_err());
        assert!(parse_server_address("8.8.8.8:0").is_err());
    }

    #[test]
    fn prepare_rejects_more_than_limit() {
        let queries: Vec<QuerySpec> = (0..=MAX_QUERIES)
            .map(|i| query(&format!("r{i}"), "google", "example.com", "A"))
            .collect();
        let error = prepare(&run(queries, vec![server("google", Some("8.8.8.8"))]))
            .expect_err("предел должен сработать");
        assert!(error.contains("Слишком много запросов"), "текст: {error}");
    }

    #[test]
    fn prepare_rejects_duplicate_addresses() {
        let error = prepare(&run(
            vec![query("r1", "google", "example.com", "A")],
            vec![
                server("google", Some("8.8.8.8")),
                server("other", Some("8.8.8.8:53")),
            ],
        ))
        .expect_err("дубликат адреса");
        assert!(error.contains("указан дважды"), "текст: {error}");
    }

    #[test]
    fn prepare_rejects_unknown_server() {
        let error = prepare(&run(
            vec![query("r1", "missing", "example.com", "A")],
            vec![server("google", Some("8.8.8.8"))],
        ))
        .expect_err("неизвестный сервер");
        assert!(error.contains("Неизвестный сервер"), "текст: {error}");
    }

    #[test]
    fn prepare_marks_system_server() {
        let prepared = prepare(&run(
            vec![query("r1", "system", "example.com", "A")],
            vec![server("system", None)],
        ))
        .expect("системный сервер допустим");
        assert!(matches!(prepared.queries[0].target, Target::System));
    }

    #[test]
    fn prepare_rejects_unknown_type() {
        let error = prepare(&run(
            vec![query("r1", "google", "example.com", "ANY")],
            vec![server("google", Some("8.8.8.8"))],
        ))
        .expect_err("неизвестный тип");
        assert!(error.contains("Неизвестный тип"), "текст: {error}");
    }
}

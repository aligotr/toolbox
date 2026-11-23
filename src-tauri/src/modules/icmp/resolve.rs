//! Разрешение целей проверки в адреса.
//!
//! Цель - то, что ввёл пользователь: домен, IPv4, IPv6 или IPv6 со scope id.
//! Адрес проверки - конкретный IPv4/IPv6, по которому уходит пакет. Домен
//! разрешается один раз при старте, как у системного `ping`, поэтому набор
//! адресов на весь прогон не меняется.
//!
//! Резолвер спрятан за трейтом: оркестрацию можно испытать без сети и без
//! зависимости от DNS машины. Системный резолвер работает через
//! `ToSocketAddrs`, то есть через тот же `getaddrinfo`, что и остальная
//! система.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, ToSocketAddrs};
use std::str::FromStr;

use hickory_proto::rr::Name;

use crate::core::infra::error::AppError;

use super::request::Family;
use super::transport::CheckAddress;

/// Итог разрешения одной цели.
#[derive(Debug, Clone)]
pub struct ResolveOutcome {
    /// ASCII-форма имени, если ввод пришлось нормализовать.
    pub normalized: Option<String>,
    pub addresses: Vec<CheckAddress>,
    /// Причина, по которой адресов нет.
    pub error: Option<AppError>,
}

impl ResolveOutcome {
    /// Цель без адресов: имя не разрешилось или формат неверен.
    pub fn failed(error: AppError) -> Self {
        Self {
            normalized: None,
            addresses: Vec::new(),
            error: Some(error),
        }
    }

    /// Есть ли у цели хотя бы один адрес.
    pub fn resolved(&self) -> bool {
        self.error.is_none() && !self.addresses.is_empty()
    }
}

/// Разрешение цели в адреса проверки.
pub trait TargetResolver: Send + Sync {
    fn resolve(&self, input: &str, family: Family) -> ResolveOutcome;
}

/// Системный резолвер: `getaddrinfo` и разбор IP-литералов.
pub struct SystemResolver;

impl TargetResolver for SystemResolver {
    fn resolve(&self, input: &str, family: Family) -> ResolveOutcome {
        let input = input.trim();
        if input.is_empty() {
            return ResolveOutcome::failed(AppError::new(
                "errors.icmp.emptyTarget",
                "Пустая цель проверки",
            ));
        }

        let literal = parse_literal(input);
        if let Some(result) = literal {
            return match result {
                Ok(address) => {
                    if !family.accepts(&address.ip) {
                        return ResolveOutcome::failed(
                            AppError::new(
                                "errors.icmp.familyMismatch",
                                format!("Адрес {input} не относится к выбранному семейству"),
                            )
                            .with("target", input)
                            .with("family", family.as_str()),
                        );
                    }
                    ResolveOutcome {
                        normalized: None,
                        addresses: vec![address],
                        error: None,
                    }
                }
                Err(error) => ResolveOutcome::failed(error),
            };
        }

        let name = match normalize_name(input) {
            Ok(name) => name,
            Err(error) => return ResolveOutcome::failed(error),
        };

        let resolved = match (name.as_str(), 0u16).to_socket_addrs() {
            Ok(addresses) => addresses,
            Err(error) => {
                return ResolveOutcome::failed(
                    AppError::new(
                        "errors.icmp.resolveFailed",
                        format!("Не удалось разрешить {name}: {error}"),
                    )
                    .with("target", name)
                    .with("reason", error),
                );
            }
        };

        let addresses = check_addresses(resolved, family);
        resolved_name(name, addresses, family)
    }
}

/// Оставляет адреса выбранного семейства и убирает повторы.
fn check_addresses<I>(resolved: I, family: Family) -> Vec<CheckAddress>
where
    I: IntoIterator<Item = SocketAddr>,
{
    let mut addresses: Vec<CheckAddress> = Vec::new();
    for address in resolved {
        if !family.accepts(&address.ip()) {
            continue;
        }
        let check = match address {
            SocketAddr::V4(v4) => CheckAddress::new(IpAddr::V4(*v4.ip())),
            SocketAddr::V6(v6) => CheckAddress::with_scope(IpAddr::V6(*v6.ip()), v6.scope_id()),
        };
        if !addresses.contains(&check) {
            addresses.push(check);
        }
    }
    addresses
}

/// Итог разрешения имени: пустой список даёт отказ, а не пустую цель.
fn resolved_name(name: String, addresses: Vec<CheckAddress>, family: Family) -> ResolveOutcome {
    if addresses.is_empty() {
        return ResolveOutcome {
            normalized: Some(name.clone()),
            addresses,
            error: Some(
                AppError::new(
                    "errors.icmp.noAddresses",
                    format!("У {name} нет адресов выбранного семейства"),
                )
                .with("target", name)
                .with("family", family.as_str()),
            ),
        };
    }

    ResolveOutcome {
        normalized: Some(name),
        addresses,
        error: None,
    }
}

/// Разбирает IP-литерал, если ввод им является.
///
/// `None` означает «это не литерал, а имя»: разбор имени идёт отдельно,
/// потому что имя может выглядеть как что угодно.
fn parse_literal(input: &str) -> Option<Result<CheckAddress, AppError>> {
    let unbracketed = input
        .strip_prefix('[')
        .and_then(|rest| rest.strip_suffix(']'))
        .unwrap_or(input);

    let (address, scope) = match unbracketed.split_once('%') {
        Some((address, scope)) => (address, Some(scope)),
        None => (unbracketed, None),
    };

    if let Ok(ip) = Ipv4Addr::from_str(address) {
        if scope.is_some() {
            return Some(Err(AppError::new(
                "errors.icmp.invalidTarget",
                format!("У адреса {input} не бывает scope id"),
            )
            .with("target", input)));
        }
        return Some(Ok(CheckAddress::new(IpAddr::V4(ip))));
    }

    if let Ok(ip) = Ipv6Addr::from_str(address) {
        let scope_id = match scope {
            None => 0,
            Some(scope) => match u32::from_str(scope) {
                Ok(scope_id) => scope_id,
                Err(_) => {
                    return Some(Err(AppError::new(
                        "errors.icmp.invalidTarget",
                        format!("Неверный scope id в {input}"),
                    )
                    .with("target", input)));
                }
            },
        };
        return Some(Ok(CheckAddress::with_scope(IpAddr::V6(ip), scope_id)));
    }

    // Двоеточие в имени без разобранного литерала - почти наверняка
    // опечатка в адресе, и `getaddrinfo` ответит невнятным отказом.
    if unbracketed.contains(':') {
        return Some(Err(AppError::new(
            "errors.icmp.invalidTarget",
            format!("Неверный IP-адрес {input}"),
        )
        .with("target", input)));
    }

    None
}

/// Нормализует доменное имя: IDN становится ASCII, регистр - нижним.
fn normalize_name(input: &str) -> Result<String, AppError> {
    let name = Name::from_utf8(input).map_err(|error| {
        AppError::new(
            "errors.icmp.invalidTarget",
            format!("Неверное имя {input}: {error}"),
        )
        .with("target", input)
        .with("reason", error)
    })?;

    Ok(name.to_ascii().trim_end_matches('.').to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ipv4_literal() {
        let outcome = SystemResolver.resolve("192.0.2.7", Family::Auto);

        assert!(outcome.resolved(), "итог: {outcome:?}");
        assert_eq!(
            outcome.addresses[0],
            CheckAddress::new(IpAddr::V4(Ipv4Addr::new(192, 0, 2, 7)))
        );
        assert!(outcome.normalized.is_none());
    }

    #[test]
    fn parses_ipv6_literal() {
        let outcome = SystemResolver.resolve("2001:db8::1", Family::Ipv6);

        assert!(outcome.resolved(), "итог: {outcome:?}");
        assert_eq!(outcome.addresses[0].scope_id, 0);
        assert!(matches!(outcome.addresses[0].ip, IpAddr::V6(_)));
    }

    #[test]
    fn parses_scope_id() {
        let outcome = SystemResolver.resolve("fe80::1%12", Family::Auto);

        assert!(outcome.resolved(), "итог: {outcome:?}");
        assert_eq!(outcome.addresses[0].scope_id, 12);
    }

    #[test]
    fn parses_bracketed_scope_id() {
        let outcome = SystemResolver.resolve("[fe80::1%7]", Family::Auto);

        assert!(outcome.resolved(), "итог: {outcome:?}");
        assert_eq!(outcome.addresses[0].scope_id, 7);
    }

    #[test]
    fn literal_respects_family() {
        let outcome = SystemResolver.resolve("127.0.0.1", Family::Ipv6);

        assert!(!outcome.resolved());
        assert_eq!(
            outcome.error.expect("отказ").code,
            "errors.icmp.familyMismatch"
        );
    }

    #[test]
    fn family_filter_keeps_both_and_removes_duplicates() {
        let resolved = vec![
            SocketAddr::new(IpAddr::V4(Ipv4Addr::new(192, 0, 2, 1)), 0),
            SocketAddr::new(IpAddr::V6(Ipv6Addr::new(0x2001, 0xdb8, 0, 0, 0, 0, 0, 1)), 0),
            SocketAddr::new(IpAddr::V4(Ipv4Addr::new(192, 0, 2, 1)), 0),
        ];

        let addresses = check_addresses(resolved, Family::Auto);

        assert_eq!(addresses.len(), 2);
        assert!(matches!(addresses[0].ip, IpAddr::V4(_)));
        assert!(matches!(addresses[1].ip, IpAddr::V6(_)));
    }

    #[test]
    fn family_filter_keeps_only_ipv4() {
        let resolved = vec![
            SocketAddr::new(IpAddr::V4(Ipv4Addr::new(198, 51, 100, 1)), 0),
            SocketAddr::new(IpAddr::V6(Ipv6Addr::LOCALHOST), 0),
        ];

        let addresses = check_addresses(resolved, Family::Ipv4);

        assert_eq!(addresses.len(), 1);
        assert_eq!(
            addresses[0].ip,
            IpAddr::V4(Ipv4Addr::new(198, 51, 100, 1))
        );
    }

    #[test]
    fn family_filter_keeps_only_ipv6() {
        let resolved = vec![
            SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 0),
            SocketAddr::new(IpAddr::V6(Ipv6Addr::LOCALHOST), 0),
        ];

        let addresses = check_addresses(resolved, Family::Ipv6);

        assert_eq!(addresses.len(), 1);
        assert_eq!(addresses[0].ip, IpAddr::V6(Ipv6Addr::LOCALHOST));
    }

    #[test]
    fn empty_resolution_reports_no_addresses() {
        let outcome = resolved_name("example.test".to_owned(), Vec::new(), Family::Ipv6);

        assert!(!outcome.resolved());
        assert_eq!(
            outcome.error.expect("отказ").code,
            "errors.icmp.noAddresses"
        );
    }

    #[test]
    fn rejects_bad_scope_id() {
        let outcome = SystemResolver.resolve("fe80::1%eth0", Family::Auto);

        assert!(!outcome.resolved());
        assert_eq!(
            outcome.error.expect("отказ").code,
            "errors.icmp.invalidTarget"
        );
    }

    #[test]
    fn rejects_colon_typo() {
        let outcome = SystemResolver.resolve("2001:db8:::1", Family::Auto);

        assert!(!outcome.resolved());
        assert_eq!(
            outcome.error.expect("отказ").code,
            "errors.icmp.invalidTarget"
        );
    }

    #[test]
    fn rejects_empty_target() {
        let outcome = SystemResolver.resolve("   ", Family::Auto);

        assert!(!outcome.resolved());
        assert_eq!(
            outcome.error.expect("отказ").code,
            "errors.icmp.emptyTarget"
        );
    }

    #[test]
    fn normalizes_idn() {
        let name = normalize_name("Пример.РФ").expect("имя разобрано");

        assert_eq!(name, "xn--e1afmkfd.xn--p1ai");
    }
}

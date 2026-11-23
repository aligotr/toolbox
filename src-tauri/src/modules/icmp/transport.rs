//! Транспорт ICMP.
//!
//! Трейт отделяет измерение от оркестрации: проверку расписания и сводку
//! можно испытать с фейковым транспортом, не трогая сеть. Windows измеряет
//! через IP Helper API: `IcmpSendEcho` для IPv4 и `Icmp6SendEcho2` для IPv6.
//! Оба вызова синхронные, поэтому живут в рабочих потоках, а не в обработчике
//! шины (ADR 0068).
//!
//! Права администратора не нужны: это API, а не сырой сокет. На других
//! платформах стоит заглушка с честным отказом; Unix-бэкенд появится
//! отдельной задачей.

use std::net::IpAddr;
use std::time::Duration;

use crate::core::infra::error::AppError;

/// Размер данных запроса. Совпадает с умолчанием системного `ping`.
pub const PAYLOAD_SIZE: usize = 32;

/// Адрес одного пакета: IP и, для IPv6, идентификатор интерфейса.
///
/// Scope id нужен link-local адресам: без него `fe80::` не говорит,
/// в какой интерфейс отправлять запрос.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CheckAddress {
    pub ip: IpAddr,
    pub scope_id: u32,
}

impl CheckAddress {
    /// Адрес без scope id: так выглядят IPv4 и обычные IPv6.
    pub fn new(ip: IpAddr) -> Self {
        Self { ip, scope_id: 0 }
    }

    /// Адрес с идентификатором интерфейса.
    pub fn with_scope(ip: IpAddr, scope_id: u32) -> Self {
        Self { ip, scope_id }
    }
}

/// Итог одного пакета.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EchoStatus {
    /// Ответ получен.
    Ok,
    /// Ответа не было за таймаут.
    Timeout,
    /// Сеть или узел ответили отказом.
    Unreachable,
    /// Отказ вызова или платформы.
    Error,
}

impl EchoStatus {
    /// Проводное значение для интерфейса.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Ok => "ok",
            Self::Timeout => "timeout",
            Self::Unreachable => "unreachable",
            Self::Error => "error",
        }
    }
}

/// Результат одного пакета.
#[derive(Debug, Clone)]
pub struct EchoReply {
    pub status: EchoStatus,
    /// Задержка ответа; `None`, если ответа не было.
    pub rtt: Option<Duration>,
    /// TTL ответа; для IPv6 Windows его не отдаёт.
    pub ttl: Option<u8>,
    /// Причина отказа: код словаря и данные.
    pub error: Option<AppError>,
}

impl EchoReply {
    /// Ответ с задержкой и TTL.
    pub fn ok(rtt: Duration, ttl: Option<u8>) -> Self {
        Self {
            status: EchoStatus::Ok,
            rtt: Some(rtt),
            ttl,
            error: None,
        }
    }

    /// Истёк таймаут.
    pub fn timeout() -> Self {
        Self {
            status: EchoStatus::Timeout,
            rtt: None,
            ttl: None,
            error: None,
        }
    }

    /// Сеть или узел недоступен.
    pub fn unreachable() -> Self {
        Self {
            status: EchoStatus::Unreachable,
            rtt: None,
            ttl: None,
            error: None,
        }
    }

    /// Отказ с причиной.
    pub fn error(error: AppError) -> Self {
        Self {
            status: EchoStatus::Error,
            rtt: None,
            ttl: None,
            error: Some(error),
        }
    }
}

/// Измерение одного ICMP-пакета.
pub trait EchoTransport: Send + Sync {
    /// Отправляет эхо-запрос и ждёт ответ не дольше таймаута.
    fn echo(&self, address: CheckAddress, timeout: Duration, sequence: u32) -> EchoReply;
}

/// Транспорт платформы.
pub fn platform_transport() -> std::sync::Arc<dyn EchoTransport> {
    #[cfg(windows)]
    {
        std::sync::Arc::new(WindowsEchoTransport)
    }
    #[cfg(not(windows))]
    {
        std::sync::Arc::new(UnsupportedTransport)
    }
}

/// Заглушка платформ без ICMP-транспорта.
#[cfg(not(windows))]
pub struct UnsupportedTransport;

#[cfg(not(windows))]
impl EchoTransport for UnsupportedTransport {
    fn echo(&self, _address: CheckAddress, _timeout: Duration, _sequence: u32) -> EchoReply {
        EchoReply::error(AppError::new(
            "errors.icmp.unsupportedPlatform",
            "Проверка ICMP недоступна на этой платформе",
        ))
    }
}

/// Windows-транспорт через IP Helper API.
#[cfg(windows)]
pub struct WindowsEchoTransport;

#[cfg(windows)]
impl EchoTransport for WindowsEchoTransport {
    fn echo(&self, address: CheckAddress, timeout: Duration, sequence: u32) -> EchoReply {
        match address.ip {
            IpAddr::V4(ip) => echo_v4(ip, timeout, sequence),
            IpAddr::V6(ip) => echo_v6(ip, address.scope_id, timeout, sequence),
        }
    }
}

#[cfg(windows)]
fn payload(sequence: u32) -> [u8; PAYLOAD_SIZE] {
    let mut data = [0x54u8; PAYLOAD_SIZE];
    data[..4].copy_from_slice(&sequence.to_le_bytes());
    data
}

#[cfg(windows)]
fn timeout_millis(timeout: Duration) -> u32 {
    timeout.as_millis().clamp(1, u128::from(u32::MAX)) as u32
}

/// Буфер ответа с выравниванием под структуру Windows.
#[cfg(windows)]
#[repr(C, align(8))]
struct ReplyBuffer([u8; 512]);

#[cfg(windows)]
fn echo_v4(address: std::net::Ipv4Addr, timeout: Duration, sequence: u32) -> EchoReply {
    use windows::Win32::Foundation::{ERROR_TIMEOUT, GetLastError};
    use windows::Win32::NetworkManagement::IpHelper::{
        ICMP_ECHO_REPLY, IcmpCloseHandle, IcmpCreateFile, IcmpSendEcho,
    };

    let handle = match unsafe { IcmpCreateFile() } {
        Ok(handle) => handle,
        Err(error) => {
            return EchoReply::error(
                AppError::new(
                    "errors.icmp.openHandle",
                    format!("Не удалось открыть ICMP: {error}"),
                )
                .with("reason", error),
            );
        }
    };

    let data = payload(sequence);
    // 512 байт хватает на заголовок ответа, данные и служебный блок.
    let mut buffer = ReplyBuffer([0u8; 512]);
    // `IPAddr` в API лежит в сетевом порядке, поэтому байты адреса
    // переносятся как есть, без преобразования порядка числа.
    let destination = u32::from_ne_bytes(address.octets());
    let received = unsafe {
        IcmpSendEcho(
            handle,
            destination,
            data.as_ptr().cast(),
            PAYLOAD_SIZE as u16,
            None,
            buffer.0.as_mut_ptr().cast(),
            buffer.0.len() as u32,
            timeout_millis(timeout),
        )
    };
    // Последнюю ошибку читает только что отказавший вызов: закрытие handle
    // может её перезаписать.
    let failure = (received == 0).then(|| unsafe { GetLastError() });
    let _ = unsafe { IcmpCloseHandle(handle) };

    if let Some(code) = failure {
        return if code == ERROR_TIMEOUT {
            EchoReply::timeout()
        } else {
            EchoReply::error(
                AppError::new(
                    "errors.icmp.echoFailed",
                    format!("Проверка {} не выполнена: {code:?}", address),
                )
                .with("address", address)
                .with("reason", format!("{code:?}")),
            )
        };
    }

    // Буфер заполнен API: первый элемент - заголовок ответа.
    let reply = unsafe { &*(buffer.0.as_ptr() as *const ICMP_ECHO_REPLY) };
    map_v4_status(reply, address)
}

#[cfg(windows)]
fn map_v4_status(
    reply: &windows::Win32::NetworkManagement::IpHelper::ICMP_ECHO_REPLY,
    address: std::net::Ipv4Addr,
) -> EchoReply {
    use windows::Win32::NetworkManagement::IpHelper::{
        IP_DEST_HOST_UNREACHABLE, IP_DEST_NET_UNREACHABLE, IP_DEST_PORT_UNREACHABLE,
        IP_DEST_PROT_UNREACHABLE, IP_DEST_SCOPE_MISMATCH, IP_DEST_UNREACHABLE, IP_REQ_TIMED_OUT,
        IP_SUCCESS, IP_TTL_EXPIRED_REASSEM, IP_TTL_EXPIRED_TRANSIT,
    };

    match reply.Status {
        IP_SUCCESS => EchoReply::ok(
            Duration::from_millis(u64::from(reply.RoundTripTime)),
            Some(reply.Options.Ttl).filter(|ttl| *ttl > 0),
        ),
        IP_REQ_TIMED_OUT => EchoReply::timeout(),
        IP_DEST_NET_UNREACHABLE
        | IP_DEST_HOST_UNREACHABLE
        | IP_DEST_PROT_UNREACHABLE
        | IP_DEST_PORT_UNREACHABLE
        | IP_DEST_UNREACHABLE
        | IP_DEST_SCOPE_MISMATCH
        | IP_TTL_EXPIRED_TRANSIT
        | IP_TTL_EXPIRED_REASSEM => EchoReply::unreachable(),
        code => EchoReply::error(
            AppError::new(
                "errors.icmp.echoStatus",
                format!("Проверка {address} вернула код {code}"),
            )
            .with("address", address)
            .with("code", code),
        ),
    }
}

#[cfg(windows)]
fn echo_v6(
    address: std::net::Ipv6Addr,
    scope_id: u32,
    timeout: Duration,
    sequence: u32,
) -> EchoReply {
    use windows::Win32::Foundation::{ERROR_TIMEOUT, GetLastError};
    use windows::Win32::NetworkManagement::IpHelper::{
        ICMPV6_ECHO_REPLY_LH, Icmp6CreateFile, Icmp6SendEcho2, IcmpCloseHandle,
    };

    // Источник `::` означает «выбрать по таблице маршрутов»: так работают
    // и системный `ping`, и опубликованные обёртки над IP Helper. Явный
    // адрес нужен только для link-local, и тогда его задаёт scope id.
    let source = sockaddr_in6(std::net::Ipv6Addr::UNSPECIFIED, 0);
    let destination = sockaddr_in6(address, scope_id);

    let handle = match unsafe { Icmp6CreateFile() } {
        Ok(handle) => handle,
        Err(error) => {
            return EchoReply::error(
                AppError::new(
                    "errors.icmp.openHandle",
                    format!("Не удалось открыть ICMPv6: {error}"),
                )
                .with("reason", error),
            );
        }
    };

    let data = payload(sequence);
    let mut buffer = ReplyBuffer([0u8; 512]);
    let received = unsafe {
        Icmp6SendEcho2(
            handle,
            None,
            None,
            None,
            &source,
            &destination,
            data.as_ptr().cast(),
            PAYLOAD_SIZE as u16,
            None,
            buffer.0.as_mut_ptr().cast(),
            buffer.0.len() as u32,
            timeout_millis(timeout),
        )
    };
    // Последнюю ошибку читает только что отказавший вызов: закрытие handle
    // может её перезаписать.
    let failure = (received == 0).then(|| unsafe { GetLastError() });
    let _ = unsafe { IcmpCloseHandle(handle) };

    if let Some(code) = failure {
        return if code == ERROR_TIMEOUT {
            EchoReply::timeout()
        } else {
            EchoReply::error(
                AppError::new(
                    "errors.icmp.echoFailed",
                    format!("Проверка {address} не выполнена: {code:?}"),
                )
                .with("address", address)
                .with("reason", format!("{code:?}")),
            )
        };
    }

    let reply = unsafe { &*(buffer.0.as_ptr() as *const ICMPV6_ECHO_REPLY_LH) };
    map_v6_status(reply, address)
}

#[cfg(windows)]
fn sockaddr_in6(
    address: std::net::Ipv6Addr,
    scope_id: u32,
) -> windows::Win32::Networking::WinSock::SOCKADDR_IN6 {
    use windows::Win32::Networking::WinSock::{
        AF_INET6, IN6_ADDR, IN6_ADDR_0, SOCKADDR_IN6, SOCKADDR_IN6_0,
    };

    SOCKADDR_IN6 {
        sin6_family: AF_INET6,
        sin6_port: 0,
        sin6_flowinfo: 0,
        sin6_addr: IN6_ADDR {
            u: IN6_ADDR_0 {
                Byte: address.octets(),
            },
        },
        Anonymous: SOCKADDR_IN6_0 {
            sin6_scope_id: scope_id,
        },
    }
}

#[cfg(windows)]
fn map_v6_status(
    reply: &windows::Win32::NetworkManagement::IpHelper::ICMPV6_ECHO_REPLY_LH,
    address: std::net::Ipv6Addr,
) -> EchoReply {
    use windows::Win32::NetworkManagement::IpHelper::{
        IP_DEST_HOST_UNREACHABLE, IP_DEST_NET_UNREACHABLE, IP_DEST_PORT_UNREACHABLE,
        IP_DEST_PROT_UNREACHABLE, IP_DEST_SCOPE_MISMATCH, IP_DEST_UNREACHABLE, IP_REQ_TIMED_OUT,
        IP_SUCCESS, IP_TTL_EXPIRED_REASSEM, IP_TTL_EXPIRED_TRANSIT,
    };

    match reply.Status {
        IP_SUCCESS => EchoReply::ok(Duration::from_millis(u64::from(reply.RoundTripTime)), None),
        IP_REQ_TIMED_OUT => EchoReply::timeout(),
        IP_DEST_NET_UNREACHABLE
        | IP_DEST_HOST_UNREACHABLE
        | IP_DEST_PROT_UNREACHABLE
        | IP_DEST_PORT_UNREACHABLE
        | IP_DEST_UNREACHABLE
        | IP_DEST_SCOPE_MISMATCH
        | IP_TTL_EXPIRED_TRANSIT
        | IP_TTL_EXPIRED_REASSEM => EchoReply::unreachable(),
        code => EchoReply::error(
            AppError::new(
                "errors.icmp.echoStatus",
                format!("Проверка {address} вернула код {code}"),
            )
            .with("address", address)
            .with("code", code),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn ipv4_loopback_answers() {
        let reply = WindowsEchoTransport.echo(
            CheckAddress::new(IpAddr::V4(std::net::Ipv4Addr::LOCALHOST)),
            Duration::from_millis(1000),
            1,
        );

        assert_eq!(reply.status, EchoStatus::Ok, "ответ: {reply:?}");
        assert!(reply.rtt.is_some());
        assert!(reply.ttl.is_some());
    }

    /// Живая проверка IPv6: на машинах с выключенным IPv6 (`DisabledComponents`
    /// содержит бит отключения) `Icmp6SendEcho2` отвечает общим отказом.
    /// Поэтому тест запускается вручную на машине с рабочим IPv6.
    #[cfg(windows)]
    #[test]
    #[ignore = "нужен включённый IPv6"]
    fn ipv6_loopback_answers() {
        let reply = WindowsEchoTransport.echo(
            CheckAddress::new(IpAddr::V6(std::net::Ipv6Addr::LOCALHOST)),
            Duration::from_millis(1000),
            1,
        );

        assert_eq!(reply.status, EchoStatus::Ok, "ответ: {reply:?}");
        assert!(reply.rtt.is_some());
    }

    #[cfg(windows)]
    #[test]
    fn maps_ipv4_statuses() {
        use windows::Win32::NetworkManagement::IpHelper::{
            ICMP_ECHO_REPLY, IP_DEST_HOST_UNREACHABLE, IP_REQ_TIMED_OUT, IP_SUCCESS,
        };

        let address = std::net::Ipv4Addr::new(192, 0, 2, 1);
        let mut reply = ICMP_ECHO_REPLY {
            Address: u32::from_ne_bytes(address.octets()),
            RoundTripTime: 12,
            ..Default::default()
        };

        reply.Status = IP_SUCCESS;
        let ok = map_v4_status(&reply, address);
        assert_eq!(ok.status, EchoStatus::Ok);
        assert_eq!(ok.rtt, Some(Duration::from_millis(12)));

        reply.Status = IP_REQ_TIMED_OUT;
        assert_eq!(map_v4_status(&reply, address).status, EchoStatus::Timeout);

        reply.Status = IP_DEST_HOST_UNREACHABLE;
        assert_eq!(
            map_v4_status(&reply, address).status,
            EchoStatus::Unreachable
        );
    }

    #[cfg(windows)]
    #[test]
    fn maps_ipv6_statuses() {
        use windows::Win32::NetworkManagement::IpHelper::{
            ICMPV6_ECHO_REPLY_LH, IP_DEST_NET_UNREACHABLE, IP_REQ_TIMED_OUT, IP_SUCCESS,
        };

        let address = std::net::Ipv6Addr::new(0x2001, 0xdb8, 0, 0, 0, 0, 0, 1);
        let mut reply = ICMPV6_ECHO_REPLY_LH {
            RoundTripTime: 7,
            ..Default::default()
        };

        reply.Status = IP_SUCCESS;
        let ok = map_v6_status(&reply, address);
        assert_eq!(ok.status, EchoStatus::Ok);
        assert_eq!(ok.rtt, Some(Duration::from_millis(7)));
        // Windows не отдаёт TTL в ответе ICMPv6.
        assert_eq!(ok.ttl, None);

        reply.Status = IP_REQ_TIMED_OUT;
        assert_eq!(map_v6_status(&reply, address).status, EchoStatus::Timeout);

        reply.Status = IP_DEST_NET_UNREACHABLE;
        assert_eq!(
            map_v6_status(&reply, address).status,
            EchoStatus::Unreachable
        );
    }

    #[cfg(windows)]
    #[test]
    fn sockaddr_keeps_scope_id() {
        let address = std::net::Ipv6Addr::new(0xfe80, 0, 0, 0, 0, 0, 0, 1);
        let sockaddr = sockaddr_in6(address, 42);

        let bytes = unsafe { sockaddr.sin6_addr.u.Byte };
        assert_eq!(bytes, address.octets());
        assert_eq!(unsafe { sockaddr.Anonymous.sin6_scope_id }, 42);
    }
}

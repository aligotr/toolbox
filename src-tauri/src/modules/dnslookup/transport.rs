//! Синхронный транспорт DNS: UDP с фолбэком на TCP.
//!
//! Клиентские обёртки hickory требуют tokio, а приложению нужен один короткий
//! запрос на ячейку. Поэтому сокеты свои, а hickory отвечает только за сборку
//! и разбор сообщений (ADR 0016).
//!
//! Правила простые: 3 секунды на попытку, ответ принимается только со своим
//! идентификатором и только от того сервера, которому отправлен запрос.
//! Усечённый ответ (`TC`) повторяется по TCP.

use std::io::{Read, Write};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, TcpStream, UdpSocket};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, mpsc};
use std::time::Duration;

use hickory_proto::op::{Message, MessageType, OpCode, Query, ResponseCode};
use hickory_proto::rr::{Name, RecordType};

use crate::core::infra::error::AppError;

use super::records;
use super::request::Answer;

/// Время одной попытки: дольше пользователь не готов ждать ячейку.
pub const ATTEMPT_TIMEOUT: Duration = Duration::from_secs(3);

/// Размер буфера UDP. Формально без EDNS сервер шлёт не больше 512 байт,
/// но запас снимает ложные ошибки на серверах, которые присылают больше
/// без флага усечения.
const UDP_BUFFER: usize = 4096;

/// Результат проверки одной ячейки.
#[derive(Debug)]
pub struct Outcome {
    /// Проводное значение статуса.
    pub status: &'static str,
    pub answers: Vec<Answer>,
    pub error: Option<AppError>,
}

impl Outcome {
    /// Ошибка разбора или несовпадение ответа.
    pub fn bad(error: AppError) -> Self {
        Self {
            status: "bad_response",
            answers: Vec::new(),
            error: Some(error),
        }
    }

    /// Сокет не дождался ответа.
    pub fn timeout() -> Self {
        Self {
            status: "timeout",
            answers: Vec::new(),
            error: None,
        }
    }

    /// Сеть недоступна: сокет вернул ошибку, кроме таймаута.
    pub fn offline(error: AppError) -> Self {
        Self {
            status: "offline",
            answers: Vec::new(),
            error: Some(error),
        }
    }

    /// Ответ, который можно показать пользователю.
    fn is_reply(&self) -> bool {
        !matches!(self.status, "timeout" | "offline" | "bad_response")
    }
}

/// Отправляет запрос на все адреса и берёт первый содержательный ответ.
///
/// Системный сервер может быть представлен несколькими резолверами. Запросы
/// уходят параллельно; ответ, пришедший первым, отменяет ожидание остальных.
/// Если ответа нет ни от кого, показывается первая ошибка.
pub fn resolve(addresses: &[SocketAddr], name: &Name, record_type: RecordType) -> Outcome {
    if addresses.is_empty() {
        return Outcome::bad(AppError::new(
            "errors.dnslookup.noResolvers",
            "Системные резолверы не найдены",
        ));
    }
    if addresses.len() == 1 {
        return query_once(addresses[0], name, record_type);
    }

    let (sender, receiver) = mpsc::channel::<Outcome>();
    let answered = Arc::new(AtomicBool::new(false));
    let wait = ATTEMPT_TIMEOUT + Duration::from_millis(500);

    for &address in addresses {
        let sender = sender.clone();
        let answered = answered.clone();
        let name = name.clone();
        std::thread::spawn(move || {
            if answered.load(Ordering::SeqCst) {
                return;
            }
            let outcome = query_once(address, &name, record_type);
            if outcome.is_reply() {
                answered.store(true, Ordering::SeqCst);
            }
            // Приёмник мог уже закрыться: тогда ответ просто не нужен.
            let _ = sender.send(outcome);
        });
    }

    let mut fallback = None;
    loop {
        match receiver.recv_timeout(wait) {
            Ok(outcome) if outcome.is_reply() => return outcome,
            Ok(outcome) => {
                fallback.get_or_insert(outcome);
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                return fallback.unwrap_or_else(Outcome::timeout);
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                return fallback.unwrap_or_else(Outcome::timeout);
            }
        }
    }
}

/// Одна попытка на один адрес: UDP и, при усечении, TCP.
fn query_once(address: SocketAddr, name: &Name, record_type: RecordType) -> Outcome {
    let id = random_id();
    let mut message = Message::query();
    message.metadata.id = id;
    message.metadata.op_code = OpCode::Query;
    message.metadata.recursion_desired = true;
    message.add_query(Query::query(name.clone(), record_type));

    let request = match message.to_vec() {
        Ok(request) => request,
        Err(error) => {
            return Outcome::bad(
                AppError::new(
                    "errors.dnslookup.requestBuild",
                    format!("Не удалось собрать DNS-запрос: {error}"),
                )
                .with("reason", error),
            );
        }
    };

    let response = match exchange_udp(address, &request, id) {
        Ok(response) => response,
        Err(outcome) => return outcome,
    };

    if response.metadata.truncation {
        return match exchange_tcp(address, &request, id) {
            Ok(response) => classify(response, record_type),
            Err(outcome) => outcome,
        };
    }
    classify(response, record_type)
}

/// Обмен по UDP.
fn exchange_udp(address: SocketAddr, request: &[u8], id: u16) -> Result<Message, Outcome> {
    let bind = match address.ip() {
        IpAddr::V4(_) => SocketAddr::new(IpAddr::V4(Ipv4Addr::UNSPECIFIED), 0),
        IpAddr::V6(_) => SocketAddr::new(IpAddr::V6(Ipv6Addr::UNSPECIFIED), 0),
    };
    let socket = UdpSocket::bind(bind).map_err(|error| {
        Outcome::offline(
            AppError::new(
                "errors.dnslookup.socketOpen",
                format!("Не удалось открыть UDP-сокет: {error}"),
            )
            .with("reason", error),
        )
    })?;
    socket
        .set_read_timeout(Some(ATTEMPT_TIMEOUT))
        .map_err(io_outcome)?;
    socket
        .set_write_timeout(Some(ATTEMPT_TIMEOUT))
        .map_err(io_outcome)?;
    // `connect` привязывает сокет к серверу: ядро само отбрасывает датаграммы
    // с чужих адресов, поэтому отдельная проверка отправителя не нужна.
    socket.connect(address).map_err(io_outcome)?;
    socket.send(request).map_err(io_outcome)?;

    let mut buffer = [0u8; UDP_BUFFER];
    let size = socket.recv(&mut buffer).map_err(io_outcome)?;
    decode_response(&buffer[..size], id)
}

/// Обмен по TCP: двухбайтовый префикс длины и полный ответ.
fn exchange_tcp(address: SocketAddr, request: &[u8], id: u16) -> Result<Message, Outcome> {
    let mut stream = TcpStream::connect_timeout(&address, ATTEMPT_TIMEOUT).map_err(io_outcome)?;
    stream
        .set_read_timeout(Some(ATTEMPT_TIMEOUT))
        .map_err(io_outcome)?;
    stream
        .set_write_timeout(Some(ATTEMPT_TIMEOUT))
        .map_err(io_outcome)?;

    let length = u16::try_from(request.len()).map_err(|_| {
        Outcome::bad(AppError::new(
            "errors.dnslookup.tooLarge",
            "DNS-запрос больше 65535 байт",
        ))
    })?;
    stream
        .write_all(&length.to_be_bytes())
        .map_err(io_outcome)?;
    stream.write_all(request).map_err(io_outcome)?;

    let mut length_buffer = [0u8; 2];
    stream.read_exact(&mut length_buffer).map_err(io_outcome)?;
    let size = u16::from_be_bytes(length_buffer) as usize;
    if size == 0 {
        return Err(Outcome::bad(AppError::new(
            "errors.dnslookup.emptyReply",
            "Сервер вернул пустой TCP-ответ",
        )));
    }

    let mut buffer = vec![0u8; size];
    stream.read_exact(&mut buffer).map_err(io_outcome)?;
    decode_response(&buffer, id)
}

/// Разбирает ответ и проверяет, что это ответ на наш запрос.
fn decode_response(bytes: &[u8], expected_id: u16) -> Result<Message, Outcome> {
    let message = Message::from_vec(bytes).map_err(|error| {
        Outcome::bad(
            AppError::new(
                "errors.dnslookup.badReply",
                format!("Ответ не разобран: {error}"),
            )
            .with("reason", error),
        )
    })?;
    if message.metadata.id != expected_id {
        return Err(Outcome::bad(AppError::new(
            "errors.dnslookup.wrongId",
            "Идентификатор ответа не совпал с запросом",
        )));
    }
    if message.metadata.message_type != MessageType::Response {
        return Err(Outcome::bad(AppError::new(
            "errors.dnslookup.notReply",
            "Получено не сообщение-ответ",
        )));
    }
    Ok(message)
}

/// Переводит код ответа и записи в статус ячейки.
fn classify(message: Message, record_type: RecordType) -> Outcome {
    let status = match message.metadata.response_code {
        ResponseCode::NoError => {
            let answers = records::answers(&message.answers, record_type);
            if answers.is_empty() {
                return Outcome {
                    status: "nodata",
                    answers: Vec::new(),
                    error: None,
                };
            }
            return Outcome {
                status: "ok",
                answers,
                error: None,
            };
        }
        ResponseCode::NXDomain => "nxdomain",
        ResponseCode::ServFail => "servfail",
        ResponseCode::Refused => "refused",
        ResponseCode::FormErr => "formerr",
        ResponseCode::NotImp => "notimp",
        other => {
            return Outcome::bad(
                AppError::new(
                    "errors.dnslookup.unexpectedCode",
                    format!("Неожиданный код ответа DNS: {other:?}"),
                )
                .with("code", format!("{other:?}")),
            );
        }
    };
    Outcome {
        status,
        answers: Vec::new(),
        error: None,
    }
}

/// Ошибка сокета: таймаут и «сеть недоступна» различаются для интерфейса.
fn io_outcome(error: std::io::Error) -> Outcome {
    use std::io::ErrorKind;
    match error.kind() {
        ErrorKind::TimedOut | ErrorKind::WouldBlock => Outcome::timeout(),
        _ => Outcome::offline(
            AppError::new("errors.dnslookup.network", format!("Ошибка сети: {error}"))
                .with("reason", error),
        ),
    }
}

/// Случайный идентификатор запроса: время и счётчик, без лишней зависимости.
fn random_id() -> u16 {
    static COUNTER: AtomicU32 = AtomicU32::new(0);
    let counter = COUNTER.fetch_add(0x9e37_79b9, Ordering::Relaxed);
    let time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.subsec_nanos())
        .unwrap_or(0);
    (counter ^ time) as u16
}

#[cfg(test)]
mod tests {
    use super::*;
    use hickory_proto::rr::Record;
    use hickory_proto::rr::rdata::A;
    use std::net::UdpSocket;
    use std::thread;

    fn name(value: &str) -> Name {
        Name::from_utf8(value).expect("имя")
    }

    fn answer_name() -> Name {
        name("example.com.")
    }

    fn response(code: ResponseCode, with_answer: bool) -> Message {
        let mut message = Message::response(42, OpCode::Query);
        message.metadata.response_code = code;
        if with_answer {
            message.add_answer(Record::from_rdata(
                answer_name(),
                60,
                RData::A(A::new(93, 184, 216, 34)),
            ));
        }
        message
    }

    use hickory_proto::rr::RData;

    #[test]
    fn noerror_with_answer_is_ok() {
        let outcome = classify(response(ResponseCode::NoError, true), RecordType::A);
        assert_eq!(outcome.status, "ok");
        assert_eq!(outcome.answers[0].value, "93.184.216.34");
    }

    #[test]
    fn noerror_without_answer_is_nodata() {
        let outcome = classify(response(ResponseCode::NoError, false), RecordType::A);
        assert_eq!(outcome.status, "nodata");
    }

    #[test]
    fn error_codes_map_to_statuses() {
        assert_eq!(
            classify(response(ResponseCode::NXDomain, false), RecordType::A).status,
            "nxdomain"
        );
        assert_eq!(
            classify(response(ResponseCode::ServFail, false), RecordType::A).status,
            "servfail"
        );
        assert_eq!(
            classify(response(ResponseCode::Refused, false), RecordType::A).status,
            "refused"
        );
        assert_eq!(
            classify(response(ResponseCode::FormErr, false), RecordType::A).status,
            "formerr"
        );
        assert_eq!(
            classify(response(ResponseCode::NotImp, false), RecordType::A).status,
            "notimp"
        );
    }

    #[test]
    fn wrong_id_is_bad_response() {
        let bytes = response(ResponseCode::NoError, true)
            .to_vec()
            .expect("сериализация");
        let outcome = decode_response(&bytes, 43).expect_err("id не совпал");
        assert_eq!(outcome.status, "bad_response");
    }

    #[test]
    fn broken_packet_is_bad_response() {
        let outcome = decode_response(&[1, 2, 3], 42).expect_err("мусор не разбирается");
        assert_eq!(outcome.status, "bad_response");
    }

    #[test]
    fn local_udp_server_answers() {
        let server = UdpSocket::bind("127.0.0.1:0").expect("локальный сервер");
        let address = server.local_addr().expect("адрес сервера");

        let responder = thread::spawn(move || {
            let mut buffer = [0u8; UDP_BUFFER];
            let (size, peer) = server.recv_from(&mut buffer).expect("запрос");
            let request = Message::from_vec(&buffer[..size]).expect("запрос разобран");
            let mut reply = Message::response(request.metadata.id, request.metadata.op_code);
            reply.metadata.response_code = ResponseCode::NoError;
            reply.add_answer(Record::from_rdata(
                answer_name(),
                120,
                RData::A(A::new(203, 0, 113, 7)),
            ));
            server
                .send_to(&reply.to_vec().expect("ответ"), peer)
                .expect("отправка");
        });

        let outcome = query_once(address, &answer_name(), RecordType::A);
        responder.join().expect("ответчик завершился");

        assert_eq!(outcome.status, "ok");
        assert_eq!(outcome.answers[0].value, "203.0.113.7");
        assert_eq!(outcome.answers[0].ttl, Some(120));
    }
}

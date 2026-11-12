//! Перевод записей DNS в строки формата зоны.
//!
//! Интерфейсу не нужны типы hickory: он показывает текст и TTL. Поэтому
//! преобразование собрано здесь, а транспорт отдаёт уже готовые ответы.
//! Имена печатаются без завершающей точки — так их видно в таблице и удобно
//! сравнивать между серверами.

use hickory_proto::rr::{Name, RData, Record, RecordType};

use super::request::Answer;

/// Отбирает записи запрошенного типа и переводит их в текст.
///
/// CNAME-цепочка не разворачивается: показываются только записи того типа,
/// который спросили. Иначе ответы разных серверов сравнивались бы по разным
/// наборам данных.
pub fn answers(records: &[Record], record_type: RecordType) -> Vec<Answer> {
    records
        .iter()
        .filter(|record| record.record_type() == record_type)
        .filter_map(|record| {
            format_rdata(&record.data).map(|value| Answer {
                value,
                ttl: Some(record.ttl),
            })
        })
        .collect()
}

/// Переводит данные записи в строку формата зоны.
fn format_rdata(data: &RData) -> Option<String> {
    Some(match data {
        RData::A(address) => address.0.to_string(),
        RData::AAAA(address) => address.0.to_string(),
        RData::CNAME(target) => name(&target.0),
        RData::NS(target) => name(&target.0),
        RData::PTR(target) => name(&target.0),
        RData::MX(mx) => format!("{} {}", mx.preference, name(&mx.exchange)),
        RData::TXT(txt) => txt
            .txt_data
            .iter()
            .map(|part| String::from_utf8_lossy(part).into_owned())
            .collect::<Vec<_>>()
            .join(""),
        RData::SOA(soa) => format!(
            "{} {} {} {} {} {} {}",
            name(&soa.mname),
            name(&soa.rname),
            soa.serial,
            soa.refresh,
            soa.retry,
            soa.expire,
            soa.minimum
        ),
        RData::SRV(srv) => format!(
            "{} {} {} {}",
            srv.priority,
            srv.weight,
            srv.port,
            name(&srv.target)
        ),
        RData::CAA(caa) => format!(
            "{} {} \"{}\"",
            caa.flags(),
            caa.tag,
            String::from_utf8_lossy(&caa.value).replace('"', "\\\"")
        ),
        _ => return None,
    })
}

/// Печатает имя без завершающей точки.
fn name(value: &Name) -> String {
    value.to_utf8().trim_end_matches('.').to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use hickory_proto::rr::rdata::{A, AAAA, MX, SOA, SRV, TXT};

    fn record(name: &str, data: RData) -> Record {
        Record::from_rdata(
            Name::from_utf8(name).expect("имя владельца"),
            300,
            data,
        )
    }

    fn dns_name(value: &str) -> Name {
        Name::from_utf8(value).expect("имя")
    }

    #[test]
    fn address_records_are_plain_text() {
        let records = [
            record("example.com.", RData::A(A::new(93, 184, 216, 34))),
            record("example.com.", RData::AAAA(AAAA::new(0x2001, 0xdb8, 0, 0, 0, 0, 0, 1))),
        ];
        assert_eq!(answers(&records, RecordType::A)[0].value, "93.184.216.34");
        assert_eq!(answers(&records, RecordType::AAAA)[0].value, "2001:db8::1");
        assert_eq!(answers(&records, RecordType::A)[0].ttl, Some(300));
    }

    #[test]
    fn mx_keeps_preference_and_strips_dot() {
        let records = [record(
            "example.com.",
            RData::MX(MX::new(10, dns_name("mail.example.com."))),
        )];
        assert_eq!(answers(&records, RecordType::MX)[0].value, "10 mail.example.com");
    }

    #[test]
    fn txt_parts_are_joined() {
        let records = [record(
            "example.com.",
            RData::TXT(TXT::new(vec!["hello ".to_owned(), "world".to_owned()])),
        )];
        assert_eq!(answers(&records, RecordType::TXT)[0].value, "hello world");
    }

    #[test]
    fn soa_is_zone_format() {
        let records = [record(
            "example.com.",
            RData::SOA(SOA::new(
                dns_name("ns1.example.com."),
                dns_name("admin.example.com."),
                2026010101,
                7200,
                3600,
                1209600,
                300,
            )),
        )];
        assert_eq!(
            answers(&records, RecordType::SOA)[0].value,
            "ns1.example.com admin.example.com 2026010101 7200 3600 1209600 300"
        );
    }

    #[test]
    fn srv_keeps_all_fields() {
        let records = [record(
            "_sip._tcp.example.com.",
            RData::SRV(SRV::new(10, 60, 5060, dns_name("sip.example.com."))),
        )];
        assert_eq!(
            answers(&records, RecordType::SRV)[0].value,
            "10 60 5060 sip.example.com"
        );
    }

    #[test]
    fn caa_uses_zone_quotes() {
        let data =
            RData::try_from_str(RecordType::CAA, "0 issue \"letsencrypt.org\"").expect("CAA");
        let records = [record("example.com.", data)];
        assert_eq!(
            answers(&records, RecordType::CAA)[0].value,
            "0 issue \"letsencrypt.org\""
        );
    }

    #[test]
    fn other_types_are_ignored() {
        let records = [record("example.com.", RData::A(A::new(1, 2, 3, 4)))];
        assert!(answers(&records, RecordType::AAAA).is_empty());
    }
}

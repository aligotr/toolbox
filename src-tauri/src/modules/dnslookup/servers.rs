//! Системные резолверы и свои серверы профиля.
//!
//! «Системный» сервер — это не один адрес, а список DNS-серверов активных
//! сетевых адаптеров. Список читается у ОС через `ipconfig`, без запуска
//! `ipconfig.exe` и разбора локализованного текста.
//!
//! Порядок адресов сохраняется как у ОС: пользователь видит привычный
//! приоритет. Повторы убираются, потому что один и тот же резолвер может
//! быть прописан на нескольких адаптерах.
//!
//! Свои серверы принадлежат профилю: файл `servers.json` лежит в папке
//! данных профиля и синхронизируется вместе с ним. Адреса приводятся
//! к каноническому виду здесь, а не в интерфейсе: тогда «1.1.1.1» и
//! «1.1.1.1:53» — один сервер и в файле, и в проверке дубликатов.

use std::net::{IpAddr, SocketAddr};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::core::store::files;

use super::request::parse_server_address;

/// Папка данных инструмента внутри папки данных профиля.
const DATA_DIR: &str = "dnslookup";

/// Имя файла своих серверов.
const SERVERS_FILE: &str = "servers.json";

/// Версия формата файла. Незнакомая версия — ошибка, а не догадка:
/// запись поверх неё потеряла бы поля будущих версий.
const FILE_VERSION: u32 = 1;

/// Свой DNS-сервер в профиле.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StoredServer {
    pub id: String,
    pub label: String,
    pub address: String,
}

/// Содержимое файла своих серверов.
#[derive(Debug, Serialize, Deserialize)]
struct ServersFile {
    version: u32,
    servers: Vec<StoredServer>,
}

/// Путь к файлу своих серверов внутри папки данных профиля.
pub fn servers_path(data_dir: &Path) -> PathBuf {
    data_dir.join(DATA_DIR).join(SERVERS_FILE)
}

/// Читает свои серверы профиля.
///
/// Отсутствие файла — пустой список: своих серверов ещё не заводили.
/// Битый файл — ошибка с путём: молча начать с пустого списка значило бы
/// потерять настройки при первой же записи.
pub fn load(data_dir: &Path) -> Result<Vec<StoredServer>, String> {
    let path = servers_path(data_dir);
    let Some(raw) = files::read(&path)? else {
        return Ok(Vec::new());
    };

    let file: ServersFile = serde_json::from_str(files::strip_bom(&raw))
        .map_err(|error| format!("Не удалось разобрать '{}': {error}", path.display()))?;

    if file.version != FILE_VERSION {
        return Err(format!(
            "Неподдерживаемая версия файла '{}': {}",
            path.display(),
            file.version
        ));
    }

    normalize(&file.servers).map_err(|error| format!("'{}': {error}", path.display()))
}

/// Записывает свои серверы профиля атомарно.
///
/// Ошибка проверки возвращается до создания папки и файла: неверный список
/// не должен затирать прежний рабочий.
pub fn save(data_dir: &Path, servers: &[StoredServer]) -> Result<(), String> {
    let normalized = normalize(servers)?;
    let path = servers_path(data_dir);

    if let Some(parent) = path.parent() {
        files::ensure_dir(parent)?;
    }

    let file = ServersFile {
        version: FILE_VERSION,
        servers: normalized,
    };
    let text = serde_json::to_string_pretty(&file)
        .map_err(|error| format!("Свои серверы не сериализованы: {error}"))?;

    files::write_atomic(&path, &format!("{text}\n"))
}

/// Приводит список к каноническому виду и проверяет адреса.
///
/// Пустое название заменяется адресом: сервер без подписи в списке
/// не отличить от соседнего.
fn normalize(servers: &[StoredServer]) -> Result<Vec<StoredServer>, String> {
    let mut normalized: Vec<StoredServer> = Vec::with_capacity(servers.len());
    let mut addresses: Vec<SocketAddr> = Vec::with_capacity(servers.len());

    for server in servers {
        let id = server.id.trim();
        if id.is_empty() {
            return Err("У своего сервера пустой идентификатор".to_owned());
        }
        if normalized.iter().any(|existing| existing.id == id) {
            return Err(format!("Идентификатор сервера '{id}' повторяется"));
        }

        let address = parse_server_address(&server.address)?;
        if addresses.contains(&address) {
            return Err(format!("Сервер {address} указан дважды"));
        }
        addresses.push(address);

        let label = server.label.trim();
        normalized.push(StoredServer {
            id: id.to_owned(),
            label: if label.is_empty() {
                address.to_string()
            } else {
                label.to_owned()
            },
            address: address.to_string(),
        });
    }

    Ok(normalized)
}

/// Возвращает DNS-серверы активных адаптеров без повторов.
#[cfg(windows)]
pub fn system_addresses() -> Result<Vec<IpAddr>, String> {
    use ipconfig::OperStatus;

    let adapters = ipconfig::get_adapters()
        .map_err(|error| format!("Не удалось прочитать сетевые адаптеры: {error}"))?;

    let mut servers = Vec::new();
    for adapter in adapters {
        if adapter.oper_status() != OperStatus::IfOperStatusUp {
            continue;
        }
        for address in adapter.dns_servers() {
            if !servers.contains(address) {
                servers.push(*address);
            }
        }
    }
    Ok(servers)
}

/// На других платформах системные резолверы не поддерживаются.
#[cfg(not(windows))]
pub fn system_addresses() -> Result<Vec<IpAddr>, String> {
    Ok(Vec::new())
}

#[cfg(test)]
mod tests {
    //! Проверки касаются границы с файлом: отсутствие файла — не поломка,
    //! испорченный файл даёт причину с путём, а адреса сравниваются
    //! в каноническом виде. Сеть здесь не нужна.

    use super::*;
    use std::fs;

    fn temp_dir(tag: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "toolbox-dnslookup-servers-{tag}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).expect("временная папка");
        path
    }

    fn server(label: &str, address: &str) -> StoredServer {
        StoredServer {
            id: format!("id-{label}"),
            label: label.to_owned(),
            address: address.to_owned(),
        }
    }

    #[test]
    fn missing_file_is_empty_list() {
        let dir = temp_dir("missing");
        assert_eq!(load(&dir).expect("пустой список"), Vec::new());
    }

    #[test]
    fn saved_servers_are_loaded_back() {
        let dir = temp_dir("roundtrip");
        let servers = vec![server("Локальный DNS", "10.0.0.53:5353")];

        save(&dir, &servers).expect("запись");
        let loaded = load(&dir).expect("чтение");

        assert_eq!(loaded, servers);
        assert!(servers_path(&dir).exists(), "файл должен появиться");
    }

    #[test]
    fn default_port_and_empty_label_are_canonicalized() {
        let dir = temp_dir("canonical");
        save(&dir, &[server("", "8.8.8.8")]).expect("запись");

        let loaded = load(&dir).expect("чтение");
        assert_eq!(loaded[0].address, "8.8.8.8:53");
        assert_eq!(loaded[0].label, "8.8.8.8:53");
    }

    #[test]
    fn broken_json_is_reported_with_path_and_not_rewritten() {
        let dir = temp_dir("broken");
        let path = servers_path(&dir);
        fs::create_dir_all(path.parent().expect("папка")).expect("папка");
        fs::write(&path, "{ не json").expect("испорченный файл");

        let error = load(&dir).expect_err("битый файл");
        assert!(error.contains(&path.display().to_string()), "текст: {error}");
        assert_eq!(fs::read_to_string(&path).expect("файл"), "{ не json");
    }

    #[test]
    fn unsupported_version_is_rejected() {
        let dir = temp_dir("version");
        let path = servers_path(&dir);
        fs::create_dir_all(path.parent().expect("папка")).expect("папка");
        fs::write(&path, r#"{ "version": 2, "servers": [] }"#).expect("файл");

        let error = load(&dir).expect_err("версия не та");
        assert!(error.contains("версия"), "текст: {error}");
    }

    #[test]
    fn duplicate_addresses_are_rejected_before_write() {
        let dir = temp_dir("duplicate");
        let servers = vec![server("Первый", "1.1.1.1"), server("Второй", "1.1.1.1:53")];

        let error = save(&dir, &servers).expect_err("дубликат адреса");
        assert!(error.contains("дважды"), "текст: {error}");
        assert!(
            !servers_path(&dir).exists(),
            "неверный список не должен создавать файл"
        );
    }

    #[test]
    fn invalid_address_is_rejected() {
        let dir = temp_dir("invalid");
        let error = save(&dir, &[server("Сломанный", "999.1.1.1")]).expect_err("адрес не тот");
        assert!(error.contains("адрес"), "текст: {error}");
    }

    #[test]
    fn duplicate_ids_are_rejected() {
        let dir = temp_dir("ids");
        let mut second = server("Второй", "1.1.1.1");
        second.id = "id-Первый".to_owned();

        let error = save(&dir, &[server("Первый", "8.8.8.8"), second]).expect_err("id повторяется");
        assert!(error.contains("Идентификатор"), "текст: {error}");
    }
}

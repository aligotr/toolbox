//! Настройки приложения (ADR 0005).
//!
//! Пока в файле одно поле — `log_level`. Полноценный сервис настроек появится,
//! когда полей станет больше одного: схема, спроектированная под один ключ,
//! на втором всё равно переделывается.
//!
//! Файл читают глазами и правят руками, поэтому он лежит рядом с программой
//! и остаётся обычным JSON, а не двоичным хранилищем.

use std::fs;
use std::path::Path;

use serde::Serialize;

use super::logging::LogLevel;

/// Настройки, которые сохраняются рядом с программой.
#[derive(Debug, Clone, Serialize)]
pub struct Settings {
    /// Порог файлового лога.
    pub log_level: LogLevel,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            log_level: LogLevel::default(),
        }
    }
}

/// Итог чтения настроек.
///
/// Замечания возвращаются отдельно, а не пишутся сразу: на этом шаге лог ещё
/// не запущен — неизвестно, куда писать. Их записывает `lib.rs` после
/// инициализации логгера, уже уровнем `warn`.
pub struct Loaded {
    pub settings: Settings,
    pub warnings: Vec<String>,
}

/// Читает настройки. Отсутствие файла — не поломка: это первый запуск.
///
/// Битое поле не роняет приложение: берётся значение по умолчанию, а причина
/// попадает в список замечаний.
pub fn load(path: &Path) -> Loaded {
    let mut warnings = Vec::new();

    let raw = match fs::read_to_string(path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Loaded {
                settings: Settings::default(),
                warnings,
            };
        }
        Err(error) => {
            warnings.push(format!(
                "не удалось прочитать '{}': {error}; взяты значения по умолчанию",
                path.display()
            ));
            return Loaded {
                settings: Settings::default(),
                warnings,
            };
        }
    };

    let value: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(value) => value,
        Err(error) => {
            warnings.push(format!(
                "'{}' не разобран как JSON: {error}; взяты значения по умолчанию",
                path.display()
            ));
            return Loaded {
                settings: Settings::default(),
                warnings,
            };
        }
    };

    let log_level = match value.get("log_level") {
        None => LogLevel::default(),
        Some(serde_json::Value::String(text)) => match LogLevel::parse(text) {
            Some(level) => level,
            None => {
                warnings.push(format!(
                    "поле log_level в '{}' равно '{text}', а такого уровня нет; \
                     взято значение '{}'",
                    path.display(),
                    LogLevel::default()
                ));
                LogLevel::default()
            }
        },
        Some(other) => {
            warnings.push(format!(
                "поле log_level в '{}' должно быть строкой, а не {other}; \
                 взято значение '{}'",
                path.display(),
                LogLevel::default()
            ));
            LogLevel::default()
        }
    };

    Loaded {
        settings: Settings { log_level },
        warnings,
    }
}

/// Записывает настройки. Ошибка возвращается вызывающему: молча потерять
/// настройку хуже, чем показать, что папка недоступна.
pub fn save(path: &Path, settings: &Settings) -> Result<(), String> {
    let text = serde_json::to_string_pretty(settings)
        .map_err(|error| format!("Настройки не сериализованы: {error}"))?;
    fs::write(path, format!("{text}\n"))
        .map_err(|error| format!("Не удалось записать '{}': {error}", path.display()))
}

#[cfg(test)]
mod tests {
    //! Проверки касаются устойчивости к испорченному файлу: именно из-за него
    //! приложение не должно падать на старте.

    use super::*;
    use std::path::PathBuf;

    fn temp_dir(tag: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("toolbox-settings-{tag}-{}", std::process::id()));
        fs::create_dir_all(&path).expect("временная папка");
        path
    }

    #[test]
    fn missing_file_gives_defaults_without_warning() {
        let path = temp_dir("missing").join("settings.json");
        let loaded = load(&path);

        assert_eq!(loaded.settings.log_level, LogLevel::Info);
        assert!(loaded.warnings.is_empty(), "первый запуск — не поломка");
    }

    #[test]
    fn broken_json_falls_back_to_defaults_with_warning() {
        let dir = temp_dir("broken");
        let path = dir.join("settings.json");
        fs::write(&path, "{ это не json").expect("файл настроек");

        let loaded = load(&path);

        assert_eq!(loaded.settings.log_level, LogLevel::Info);
        assert_eq!(loaded.warnings.len(), 1, "причина должна быть записана");
        assert!(loaded.warnings[0].contains("не разобран"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn unknown_level_falls_back_to_default_with_warning() {
        let dir = temp_dir("level");
        let path = dir.join("settings.json");
        fs::write(&path, r#"{"log_level":"verbose"}"#).expect("файл настроек");

        let loaded = load(&path);

        assert_eq!(loaded.settings.log_level, LogLevel::Info);
        assert!(loaded.warnings[0].contains("verbose"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn saved_level_is_read_back() {
        let dir = temp_dir("roundtrip");
        let path = dir.join("settings.json");
        let settings = Settings {
            log_level: LogLevel::Debug,
        };

        save(&path, &settings).expect("настройки записаны");
        let loaded = load(&path);

        assert_eq!(loaded.settings.log_level, LogLevel::Debug);
        assert!(loaded.warnings.is_empty());

        let _ = fs::remove_dir_all(&dir);
    }
}

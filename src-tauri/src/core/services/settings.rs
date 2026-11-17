//! Настройки приложения (ADR 0010, ADR 0012).
//!
//! Схема версионирована: `version` позволяет однажды сменить форму файла,
//! не угадывая версию по содержимому. Разделы соответствуют областям
//! изменений — `log`, `window`, `ui`, `active_profile`: интерфейс присылает
//! только изменённый раздел, иначе две панели, сохраняющие одновременно,
//! затирали бы чужие правки.
//!
//! Неизвестные ключи сохраняются при перезаписи. Файл могут править руками
//! или принести с машины с более новой версией программы; молча терять чужие
//! поля нельзя.
//!
//! Запись атомарная — `*.tmp` в той же папке и переименование: папка может
//! лежать на сетевой шаре или синхронизироваться, и половина файла там
//! превращается в постоянную поломку.

use std::fs;
use std::path::Path;

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::core::infra::error::{fail, AppError, AppResult};
use crate::core::services::languages;
use crate::core::services::logging::LogLevel;
use crate::core::services::profiles;
use crate::core::store::files::{strip_bom, write_atomic};
use crate::core::store::storage::DEFAULT_PROFILE;

/// Версия схемы файла. Меняется только вместе с миграцией чтения.
pub const VERSION: u32 = 1;

/// Размер окна по умолчанию (ADR 0011).
pub const DEFAULT_WIDTH: u32 = 1280;
/// Высота окна по умолчанию.
pub const DEFAULT_HEIGHT: u32 = 800;

/// Топик события об изменении настроек.
pub const CHANGED_TOPIC: &str = "core:settings:changed";

/// Разделы файла настроек. Имена публичные: их же получает событие
/// `core:settings:changed`, и интерфейс сверяет раздел с ними.
pub const SECTION_LOG: &str = "log";
pub const SECTION_WINDOW: &str = "window";
pub const SECTION_UI: &str = "ui";
pub const SECTION_PROFILE: &str = "active_profile";

/// Настройки, которые сохраняются в `local/settings.json`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Settings {
    pub version: u32,
    pub log: LogSettings,
    pub window: WindowSettings,
    pub ui: UiSettings,
    /// Идентификатор активного профиля: папка `profiles/<id>/`.
    pub active_profile: String,
    /// Неизвестные ключи верхнего уровня: сохраняются при перезаписи.
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: VERSION,
            log: LogSettings::default(),
            window: WindowSettings::default(),
            ui: UiSettings::default(),
            active_profile: default_profile(),
            extra: Map::new(),
        }
    }
}

/// Раздел `log`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LogSettings {
    /// Порог файлового лога. Файл правят руками, поэтому регистр не важен:
    /// `DEBUG` и `debug` значат одно и то же.
    #[serde(default, deserialize_with = "deserialize_level")]
    pub level: LogLevel,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Default for LogSettings {
    fn default() -> Self {
        Self {
            level: LogLevel::default(),
            extra: Map::new(),
        }
    }
}

/// Раздел `window`: геометрия окна.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WindowSettings {
    #[serde(default = "default_width")]
    pub width: u32,
    #[serde(default = "default_height")]
    pub height: u32,
    /// `None` — окно ещё не двигали, положение выбирает система.
    #[serde(default)]
    pub x: Option<i32>,
    #[serde(default)]
    pub y: Option<i32>,
    #[serde(default)]
    pub maximized: bool,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Default for WindowSettings {
    fn default() -> Self {
        Self {
            width: DEFAULT_WIDTH,
            height: DEFAULT_HEIGHT,
            x: None,
            y: None,
            maximized: false,
            extra: Map::new(),
        }
    }
}

/// Раздел `ui`: состояние интерфейса, которое переживает перезапуск.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UiSettings {
    #[serde(default)]
    pub sidebar_collapsed: bool,
    /// Язык интерфейса; `None` — «как в системе» (ADR 0039).
    #[serde(default, deserialize_with = "deserialize_language")]
    pub language: Option<String>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Default for UiSettings {
    fn default() -> Self {
        Self {
            sidebar_collapsed: false,
            language: None,
            extra: Map::new(),
        }
    }
}

/// Итог чтения настроек.
///
/// Замечания возвращаются отдельно, а не пишутся сразу: на этом шаге лог ещё
/// не запущен — неизвестно, куда писать. Их записывает `lib.rs` после
/// инициализации логгера, уже уровнем `warn`.
pub struct LoadedSettings {
    pub settings: Settings,
    pub warnings: Vec<AppError>,
}

/// Читает настройки. Отсутствие файла — не поломка: это первый запуск.
///
/// Разделы разбираются по отдельности: битое поле одного раздела не должно
/// сбрасывать остальные. Причина отказа попадает в список замечаний.
pub fn load(path: &Path) -> LoadedSettings {
    let mut warnings = Vec::new();

    let raw = match fs::read_to_string(path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return LoadedSettings {
                settings: Settings::default(),
                warnings,
            };
        }
        Err(error) => {
            warnings.push(
                AppError::new(
                    "errors.settings.read",
                    format!(
                        "не удалось прочитать '{}': {error}; взяты значения по умолчанию",
                        path.display()
                    ),
                )
                .with("path", path.display())
                .with("reason", error),
            );
            return LoadedSettings {
                settings: Settings::default(),
                warnings,
            };
        }
    };

    let value: Value = match serde_json::from_str(strip_bom(&raw)) {
        Ok(value) => value,
        Err(error) => {
            warnings.push(
                AppError::new(
                    "errors.settings.broken",
                    format!(
                        "'{}' не разобран как JSON: {error}; взяты значения по умолчанию",
                        path.display()
                    ),
                )
                .with("path", path.display())
                .with("reason", error),
            );
            return LoadedSettings {
                settings: Settings::default(),
                warnings,
            };
        }
    };

    let Value::Object(root) = value else {
        warnings.push(
            AppError::new(
                "errors.settings.notObject",
                format!(
                    "'{}' должен содержать объект; взяты значения по умолчанию",
                    path.display()
                ),
            )
            .with("path", path.display()),
        );
        return LoadedSettings {
            settings: Settings::default(),
            warnings,
        };
    };

    let version = read_version(&root, path, &mut warnings);
    let log = section_from(&root, SECTION_LOG, path, &mut warnings).unwrap_or_default();
    let window = section_from(&root, SECTION_WINDOW, path, &mut warnings).unwrap_or_default();
    let ui = section_from(&root, SECTION_UI, path, &mut warnings).unwrap_or_default();
    let active_profile = read_profile(&root, path, &mut warnings);

    // Всё, что не описано схемой, переносится в `extra` и вернётся при записи.
    let mut extra = root;
    for key in [
        "version",
        SECTION_LOG,
        SECTION_WINDOW,
        SECTION_UI,
        SECTION_PROFILE,
    ] {
        extra.remove(key);
    }

    LoadedSettings {
        settings: Settings {
            version,
            log,
            window,
            ui,
            active_profile,
            extra,
        },
        warnings,
    }
}

/// Записывает настройки атомарно. Ошибка возвращается вызывающему: молча
/// потерять настройку хуже, чем показать, что папка недоступна.
pub fn save(path: &Path, settings: &Settings) -> AppResult<()> {
    let text = serde_json::to_string_pretty(settings).map_err(|error| {
        AppError::new(
            "errors.settings.serialize",
            format!("Настройки не сериализованы: {error}"),
        )
        .with("reason", error)
    })?;
    write_atomic(path, &format!("{text}\n"))
}

/// Результат применения правки настроек.
#[derive(Debug)]
pub struct Committed {
    /// Настройки после правки.
    pub settings: Settings,
    /// `true` — уровень лога изменился: переключает его точка сборки.
    pub log_level_changed: bool,
}

/// Применяет правку настроек: проверка, запись файла, новая копия в памяти.
///
/// Порядок жёсткий: сначала запись, потом память. Если сохранить не удалось,
/// действующие настройки не должны разойтись с файлом. Побочные эффекты —
/// переключение логгера и событие интерфейсу — остаются точке сборки:
/// сервису для них пришлось бы знать про Tauri.
pub fn commit(
    path: &Path,
    current: &mut Settings,
    change: impl FnOnce(&Settings) -> AppResult<Settings>,
) -> AppResult<Committed> {
    let next = change(current)?;
    save(path, &next)?;

    let log_level_changed = next.log.level != current.log.level;
    *current = next.clone();

    Ok(Committed {
        settings: next,
        log_level_changed,
    })
}

/// Частичное обновление: меняет только названный раздел.
///
/// Неизменённые разделы копируются как есть, поэтому одновременная правка
/// окна и профиля не конфликтует. Неизвестный раздел — ошибка, а не молчание:
/// опечатка в имени иначе выглядела бы как успешное сохранение.
pub fn apply_patch(current: &Settings, section: &str, patch: Value) -> AppResult<Settings> {
    let mut next = current.clone();
    match section {
        SECTION_LOG => next.log = merge_section(&current.log, patch, section)?,
        SECTION_WINDOW => next.window = merge_section(&current.window, patch, section)?,
        SECTION_UI => next.ui = merge_section(&current.ui, patch, section)?,
        SECTION_PROFILE => next.active_profile = profile_from_patch(patch)?,
        other => {
            return fail!(
                "errors.settings.unknownSection",
                format!("Неизвестный раздел настроек: '{other}'"),
                section = other,
            );
        }
    }
    Ok(next)
}

/// Возвращает геометрию окна по умолчанию, не трогая остальные разделы.
pub fn reset_window(current: &Settings) -> Settings {
    let mut next = current.clone();
    next.window = WindowSettings::default();
    next
}

/// Идентификатор профиля проверяется тем же правилом, что и папка профиля:
/// два разных мнения о допустимом имени рано или поздно разошлись бы,
/// и настройки приняли бы профиль, которого сервис профилей не видит.
fn default_profile() -> String {
    DEFAULT_PROFILE.to_owned()
}

/// Разбирает уровень лога из строки: рукописный `DEBUG` допустим наравне
/// с машинным `debug`.
fn deserialize_level<'de, D>(deserializer: D) -> Result<LogLevel, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let text = String::deserialize(deserializer)?;
    LogLevel::parse(&text).ok_or_else(|| {
        serde::de::Error::custom(format!(
            "неизвестный уровень '{text}'; допустимы error, warn, info, debug"
        ))
    })
}

/// Разбирает код языка из строки или `null`.
///
/// Код становится именем файла словаря, поэтому проверяется правилом сервиса
/// словарей: путь и недопустимые символы сюда не пройдут.
fn deserialize_language<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Option::<String>::deserialize(deserializer)?;
    if let Some(code) = value.as_deref() {
        if !languages::is_code(code) {
            return Err(serde::de::Error::custom(format!(
                "недопустимый код языка '{code}'"
            )));
        }
    }
    Ok(value)
}

fn default_width() -> u32 {
    DEFAULT_WIDTH
}

fn default_height() -> u32 {
    DEFAULT_HEIGHT
}

fn read_version(root: &Map<String, Value>, path: &Path, warnings: &mut Vec<AppError>) -> u32 {
    let Some(value) = root.get("version") else {
        // Файл без версии — старый или собранный руками; читаем как текущий.
        return VERSION;
    };
    match value.as_u64() {
        Some(version) if version == u64::from(VERSION) => VERSION,
        Some(version) => {
            warnings.push(
                AppError::new(
                    "errors.settings.version",
                    format!(
                        "в '{}' версия схемы {version}, программа знает {VERSION}; \
                         файл прочитан как есть",
                        path.display()
                    ),
                )
                .with("path", path.display())
                .with("version", version)
                .with("expected", VERSION),
            );
            VERSION
        }
        None => {
            warnings.push(
                AppError::new(
                    "errors.settings.versionType",
                    format!(
                        "поле version в '{}' должно быть числом; взята версия {VERSION}",
                        path.display()
                    ),
                )
                .with("path", path.display())
                .with("expected", VERSION),
            );
            VERSION
        }
    }
}

fn read_profile(root: &Map<String, Value>, path: &Path, warnings: &mut Vec<AppError>) -> String {
    let Some(value) = root.get(SECTION_PROFILE) else {
        return default_profile();
    };
    let Some(id) = value.as_str() else {
        warnings.push(
            AppError::new(
                "errors.settings.profileType",
                format!(
                    "поле active_profile в '{}' должно быть строкой; взято '{}'",
                    path.display(),
                    default_profile()
                ),
            )
            .with("path", path.display())
            .with("profile", default_profile()),
        );
        return default_profile();
    };
    if profiles::validate_id(id).is_err() {
        warnings.push(
            AppError::new(
                "errors.settings.profileInvalid",
                format!(
                    "поле active_profile в '{}' не годится; взято '{}'",
                    path.display(),
                    default_profile()
                ),
            )
            .with("path", path.display())
            .with("profile", default_profile()),
        );
        return default_profile();
    }
    id.to_owned()
}

/// Разбирает один раздел, не роняя остальные при ошибке.
fn section_from<T: DeserializeOwned>(
    root: &Map<String, Value>,
    key: &str,
    path: &Path,
    warnings: &mut Vec<AppError>,
) -> Option<T> {
    let value = root.get(key)?;
    match serde_json::from_value(value.clone()) {
        Ok(section) => Some(section),
        Err(error) => {
            warnings.push(
                AppError::new(
                    "errors.settings.section",
                    format!(
                        "раздел '{key}' в '{}' не прочитан: {error}; взяты значения по умолчанию",
                        path.display()
                    ),
                )
                .with("section", key)
                .with("path", path.display())
                .with("reason", error),
            );
            None
        }
    }
}

/// Накладывает присланные поля на текущий раздел.
///
/// Слияние идёт через JSON, а не по полям структуры: так неизвестные ключи
/// раздела сохраняются, а проверка типов остаётся у `serde`.
fn merge_section<T>(current: &T, patch: Value, name: &str) -> AppResult<T>
where
    T: Serialize + DeserializeOwned,
{
    let mut base = serde_json::to_value(current).map_err(|error| {
        AppError::new(
            "errors.settings.sectionSerialize",
            format!("Раздел '{name}' не сериализован: {error}"),
        )
        .with("section", name)
        .with("reason", error)
    })?;
    let Value::Object(base_map) = &mut base else {
        return fail!(
            "errors.settings.sectionNotObject",
            format!("Раздел '{name}' не является объектом"),
            section = name,
        );
    };
    let Value::Object(patch_map) = patch else {
        return fail!(
            "errors.settings.sectionPatch",
            format!("Раздел '{name}' должен быть объектом"),
            section = name,
        );
    };

    for (key, value) in patch_map {
        base_map.insert(key, value);
    }

    serde_json::from_value(base).map_err(|error| {
        AppError::new(
            "errors.settings.sectionRejected",
            format!("Раздел '{name}' не принят: {error}"),
        )
        .with("section", name)
        .with("reason", error)
    })
}

fn profile_from_patch(patch: Value) -> AppResult<String> {
    let Value::String(id) = patch else {
        return fail!(
            "errors.settings.profilePatch",
            format!("Раздел '{SECTION_PROFILE}' должен быть строкой"),
            section = SECTION_PROFILE,
        );
    };
    profiles::validate_id(&id)?;
    Ok(id)
}

#[cfg(test)]
mod tests {
    //! Проверки касаются устойчивости к испорченному файлу и частичного
    //! обновления: именно из-за них настройки теряются незаметно.

    use super::*;
    use std::path::PathBuf;

    fn temp_dir(tag: &str) -> PathBuf {
        let path =
            std::env::temp_dir().join(format!("toolbox-settings-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).expect("временная папка");
        path
    }

    #[test]
    fn commit_writes_file_and_reports_log_change() {
        let path = temp_dir("commit").join("settings.json");
        let mut current = Settings::default();

        let committed = commit(&path, &mut current, |settings| {
            let mut next = settings.clone();
            next.log.level = LogLevel::Debug;
            Ok(next)
        })
        .expect("правка");

        assert!(committed.log_level_changed, "уровень лога сменился");
        assert_eq!(committed.settings.log.level, LogLevel::Debug);
        assert_eq!(current.log.level, LogLevel::Debug, "память обновлена");
        assert_eq!(load(&path).settings, current, "файл совпадает с памятью");
    }

    #[test]
    fn failed_commit_changes_nothing() {
        // Порядок жёсткий: отказ правки или записи не трогает ни память,
        // ни файл — иначе действующие настройки разошлись бы с диском.
        let path = temp_dir("commit-fail").join("settings.json");
        let mut current = Settings::default();
        save(&path, &current).expect("файл");
        let before = current.clone();

        let error = commit(&path, &mut current, |_| Err("нет".into())).expect_err("отказ");

        assert_eq!(error.to_string(), "нет");
        assert_eq!(current, before, "память не тронута");
        assert_eq!(load(&path).settings, before, "файл не тронут");
    }

    #[test]
    fn missing_file_gives_defaults_without_warning() {
        let path = temp_dir("missing").join("settings.json");
        let loaded = load(&path);

        assert_eq!(loaded.settings, Settings::default());
        assert!(loaded.warnings.is_empty(), "первый запуск — не поломка");
    }

    #[test]
    fn broken_json_falls_back_to_defaults_with_warning() {
        let dir = temp_dir("broken");
        let path = dir.join("settings.json");
        fs::write(&path, "{ это не json").expect("файл настроек");

        let loaded = load(&path);

        assert_eq!(loaded.settings, Settings::default());
        assert_eq!(loaded.warnings.len(), 1, "причина должна быть записана");
        assert!(loaded.warnings[0].to_string().contains("не разобран"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn unknown_level_falls_back_to_default_with_warning() {
        let dir = temp_dir("level");
        let path = dir.join("settings.json");
        fs::write(&path, r#"{"version":1,"log":{"level":"verbose"}}"#).expect("файл настроек");

        let loaded = load(&path);

        assert_eq!(loaded.settings.log.level, LogLevel::Info);
        assert_eq!(
            loaded.settings.window,
            WindowSettings::default(),
            "окно не затронуто"
        );
        assert!(
            loaded
                .warnings
                .iter()
                .any(|warning| warning.to_string().contains("log")),
            "замечание должно называть раздел: {:?}",
            loaded.warnings
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn bom_from_hand_edited_file_is_ignored() {
        // «Блокнот» сохраняет UTF-8 с BOM: файл должен читаться, а не
        // сбрасываться в значения по умолчанию.
        let dir = temp_dir("bom");
        let path = dir.join("settings.json");
        fs::write(
            &path,
            "\u{feff}{\"version\":1,\"log\":{\"level\":\"warn\"}}",
        )
        .expect("файл настроек");

        let loaded = load(&path);

        assert_eq!(loaded.settings.log.level, LogLevel::Warn);
        assert!(loaded.warnings.is_empty(), "BOM — не поломка");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn level_is_case_insensitive_for_hand_edited_files() {
        let dir = temp_dir("level-case");
        let path = dir.join("settings.json");
        fs::write(&path, r#"{"version":1,"log":{"level":"DEBUG"}}"#).expect("файл настроек");

        let loaded = load(&path);

        assert_eq!(loaded.settings.log.level, LogLevel::Debug);
        assert!(loaded.warnings.is_empty(), "регистр — не поломка");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn unknown_keys_survive_roundtrip() {
        let dir = temp_dir("unknown");
        let path = dir.join("settings.json");
        fs::write(
            &path,
            r#"{
                "version": 1,
                "log": { "level": "info", "future_flag": true },
                "window": { "width": 1000, "height": 700, "grid": 8 },
                "ui": { "sidebar_collapsed": true },
                "active_profile": "home",
                "plugin": { "enabled": true }
            }"#,
        )
        .expect("файл настроек");

        let loaded = load(&path);
        save(&path, &loaded.settings).expect("настройки записаны");

        let saved: Value = serde_json::from_str(&fs::read_to_string(&path).expect("файл прочитан"))
            .expect("записан JSON");

        assert_eq!(saved["plugin"]["enabled"], true);
        assert_eq!(saved["window"]["grid"], 8);
        assert_eq!(saved["log"]["future_flag"], true);
        assert_eq!(saved["active_profile"], "home");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn saved_values_are_read_back() {
        let dir = temp_dir("roundtrip");
        let path = dir.join("settings.json");
        let settings = Settings {
            log: LogSettings {
                level: LogLevel::Debug,
                ..LogSettings::default()
            },
            window: WindowSettings {
                width: 1024,
                height: 640,
                x: Some(40),
                y: Some(60),
                maximized: true,
                ..WindowSettings::default()
            },
            ui: UiSettings {
                sidebar_collapsed: true,
                ..UiSettings::default()
            },
            active_profile: "home".to_owned(),
            ..Settings::default()
        };

        save(&path, &settings).expect("настройки записаны");
        let loaded = load(&path);

        assert_eq!(loaded.settings, settings);
        assert!(loaded.warnings.is_empty());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn partial_update_touches_only_named_section() {
        let current = Settings::default();

        let next = apply_patch(&current, "window", serde_json::json!({ "width": 1000 }))
            .expect("раздел принят");

        assert_eq!(next.window.width, 1000);
        assert_eq!(next.window.height, DEFAULT_HEIGHT);
        assert_eq!(next.log, current.log);
        assert_eq!(next.ui, current.ui);
        assert_eq!(next.active_profile, current.active_profile);
    }

    #[test]
    fn partial_update_rejects_unknown_section_and_wrong_type() {
        let current = Settings::default();

        let unknown = apply_patch(&current, "theme", serde_json::json!({ "dark": true }));
        assert!(unknown.is_err(), "опечатка в разделе не должна проходить");

        let wrong_type = apply_patch(&current, "window", serde_json::json!({ "width": "широко" }));
        assert!(wrong_type.is_err(), "строка вместо числа недопустима");
    }

    #[test]
    fn profile_patch_is_validated() {
        let current = Settings::default();

        let ok = apply_patch(&current, "active_profile", serde_json::json!("home"))
            .expect("латинский идентификатор принят");
        assert_eq!(ok.active_profile, "home");

        let traversal = apply_patch(&current, "active_profile", serde_json::json!("../evil"));
        assert!(traversal.is_err(), "разделители пути недопустимы");

        let cyrillic = apply_patch(&current, "active_profile", serde_json::json!("работа"));
        assert!(cyrillic.is_err(), "кириллица недопустима");
    }

    #[test]
    fn language_patch_accepts_tag_and_null() {
        let current = Settings::default();

        let ok = apply_patch(&current, "ui", serde_json::json!({ "language": "en" }))
            .expect("тег языка принят");
        assert_eq!(ok.ui.language.as_deref(), Some("en"));

        let auto = apply_patch(&current, "ui", serde_json::json!({ "language": null }))
            .expect("null — «как в системе»");
        assert_eq!(auto.ui.language, None);
    }

    #[test]
    fn language_patch_rejects_path_and_cyrillic() {
        let current = Settings::default();

        let traversal = apply_patch(&current, "ui", serde_json::json!({ "language": "../evil" }));
        assert!(traversal.is_err(), "разделители пути недопустимы");

        let cyrillic = apply_patch(&current, "ui", serde_json::json!({ "language": "работа" }));
        assert!(cyrillic.is_err(), "кириллица недопустима");

        let underscore = apply_patch(&current, "ui", serde_json::json!({ "language": "pt_BR" }));
        assert!(underscore.is_err(), "подчёркивание — не разделитель тега");
    }

    #[test]
    fn window_reset_returns_default_geometry() {
        let settings = Settings {
            window: WindowSettings {
                width: 1000,
                height: 700,
                maximized: true,
                ..WindowSettings::default()
            },
            ..Settings::default()
        };

        let reset = reset_window(&settings);

        assert_eq!(reset.window, WindowSettings::default());
        assert_eq!(reset.log, settings.log, "остальные разделы не тронуты");
    }
}

//! Пресеты настроек инструментов: `profiles/<id>/presets/<tool>/<presetId>.json`.
//!
//! Пресет — сохранённый вход инструмента: строки, выбранные серверы, фильтры.
//! Это пользовательская настройка, а не данные анализа, поэтому файлы лежат
//! рядом с шаблонами вкладок, а не в `data/<tool>/`: очистка данных инструмента
//! пресеты не трогает.
//!
//! Документ общий для всех инструментов (ADR 0028): `version`, `tool`, `title`,
//! `saved_at` и `payload`. Разбирать `payload` ядро не может и не должно:
//! формат настроек принадлежит инструменту. Проверяется только внешний
//! договор — «настройки это JSON-объект».
//!
//! Название лежит внутри документа, имя файла — стабильный идентификатор
//! (ADR 0010). Переименование не двигает файл, поэтому конфликт синхронизации
//! затрагивает один пресет, а не весь профиль.

use std::fs;
use std::path::{Path, PathBuf};

use chrono::{SecondsFormat, Utc};
use serde::Serialize;
use serde_json::{Map, Value};

use super::files::{read, strip_bom, write_atomic};
use super::names;

/// Расширение файла пресета.
const EXTENSION: &str = "json";

/// Версия схемы файла пресета.
pub const VERSION: u32 = 1;

/// Предел длины названия: длиннее строка списка всё равно не покажет.
const MAX_TITLE_LEN: usize = 60;

/// Приписка к названию копии.
const COPY_SUFFIX: &str = " (копия)";

/// Запасное название копии, если в файле его не оказалось.
const COPY_FALLBACK: &str = "Пресет";

/// Пресет для интерфейса.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Preset {
    /// Идентификатор: имя файла без расширения.
    pub id: String,
    /// Название для интерфейса из `title`.
    pub title: String,
    /// Время сохранения в ISO-8601 UTC из `saved_at`.
    pub saved_at: String,
    /// Настройки инструмента как есть: формат принадлежит инструменту.
    pub payload: Value,
}

/// Список пресетов вместе с замечаниями о непрочитанных файлах.
///
/// Замечания возвращаются вызывающему, а не пишутся в лог: испорченный
/// пресет — факт работы подсистемы, его место в журнале интерфейса (ADR 0004).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PresetList {
    pub items: Vec<Preset>,
    pub warnings: Vec<String>,
}

/// Читает пресеты одного инструмента.
///
/// Битый файл не мешает остальным: он пропускается с причиной в `warnings`.
/// Прятать его молча нельзя — пользователь не понял бы, почему пресет исчез.
pub fn list(root: &Path, tool: &str) -> Result<PresetList, String> {
    validate_tool(tool)?;
    let dir = tool_dir(root, tool);

    let entries = match fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(PresetList {
                items: Vec::new(),
                warnings: Vec::new(),
            });
        }
        Err(error) => {
            return Err(format!("Не удалось прочитать '{}': {error}", dir.display()));
        }
    };

    let mut items = Vec::new();
    let mut warnings = Vec::new();

    for entry in entries {
        let entry =
            entry.map_err(|error| format!("Не удалось прочитать '{}': {error}", dir.display()))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if path.extension().and_then(|extension| extension.to_str()) != Some(EXTENSION) {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|stem| stem.to_str()) else {
            continue;
        };
        if !names::is_safe_id(stem) {
            continue;
        }

        let document = match read_document(&path) {
            Ok(document) => document,
            Err(reason) => {
                warnings.push(reason);
                continue;
            }
        };

        if let Err(reason) = ensure_current(&document, &path, tool) {
            warnings.push(reason);
            continue;
        }

        items.push(Preset {
            id: stem.to_owned(),
            title: title_of(&document, stem),
            saved_at: saved_at_of(&document),
            payload: payload_of(&document),
        });
    }

    // Порядок — по названию: пользователь ищет пресет глазами, а не по id.
    items.sort_by_cached_key(|preset| (preset.title.to_lowercase(), preset.id.clone()));

    Ok(PresetList { items, warnings })
}

/// Создаёт пресет из названия и настроек.
///
/// Идентификатор собирается из названия, конфликт решается суффиксом: два
/// пресета «Продакшн» — обычное дело, а совпадать имена файлов не могут.
pub fn create(
    root: &Path,
    tool: &str,
    title: &str,
    payload: Value,
) -> Result<Preset, String> {
    validate_tool(tool)?;
    let title = normalize_title(title)?;
    ensure_payload(&payload)?;

    let dir = tool_dir(root, tool);
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Не удалось создать '{}': {error}", dir.display()))?;

    let preset = Preset {
        id: unique_id(&dir, &names::slug(&title, "preset")),
        title,
        saved_at: now(),
        payload,
    };
    write_document(&dir.join(file_name(&preset.id)), tool, &preset)?;

    Ok(preset)
}

/// Заменяет настройки пресета.
///
/// Название и незнакомые ключи остаются прежними: «сохранить» — это снимок
/// текущих настроек, а не переименование. Иначе сохранение незаметно меняло бы
/// название, которое пользователь правил отдельно.
pub fn update(root: &Path, tool: &str, id: &str, payload: Value) -> Result<Preset, String> {
    validate_tool(tool)?;
    ensure_payload(&payload)?;
    let path = preset_path(root, tool, id)?;

    let mut document = read_current_document(&path, tool)?;
    let saved_at = now();
    document.insert("version".to_owned(), Value::from(VERSION));
    document.insert("tool".to_owned(), Value::from(tool));
    document.insert("saved_at".to_owned(), Value::from(saved_at.as_str()));
    document.insert("payload".to_owned(), payload.clone());
    write_document_map(&path, &document)?;

    Ok(Preset {
        id: id.to_owned(),
        title: title_of(&document, id),
        saved_at,
        payload,
    })
}

/// Переименовывает пресет: меняется название, файл остаётся на месте.
///
/// Незнакомые ключи сохраняются: файл могли дополнить вручную, и терять
/// чужие поля при переименовании нельзя.
pub fn rename(root: &Path, tool: &str, id: &str, title: &str) -> Result<Preset, String> {
    validate_tool(tool)?;
    let title = normalize_title(title)?;
    let path = preset_path(root, tool, id)?;

    let mut document = read_current_document(&path, tool)?;
    document.insert("title".to_owned(), Value::from(title.as_str()));
    write_document_map(&path, &document)?;

    Ok(Preset {
        id: id.to_owned(),
        title,
        saved_at: saved_at_of(&document),
        payload: payload_of(&document),
    })
}

/// Дублирует пресет.
///
/// Без названия копия получает приписку «(копия)»: пользователь нажал одну
/// кнопку и ждёт второй такой же пресет, а не диалог.
pub fn duplicate(
    root: &Path,
    tool: &str,
    id: &str,
    title: Option<&str>,
) -> Result<Preset, String> {
    validate_tool(tool)?;
    let path = preset_path(root, tool, id)?;
    let document = read_current_document(&path, tool)?;

    let title = match title {
        Some(title) => normalize_title(title)?,
        None => copy_title(&document),
    };

    create(root, tool, &title, payload_of(&document))
}

/// Удаляет пресет в корзину: `local/trash/presets/<tool>/`.
///
/// Переносом, а не удалением: промах в списке не должен стоить собранных
/// настроек. Корзину чистят руками.
pub fn delete(root: &Path, trash_root: &Path, tool: &str, id: &str) -> Result<PathBuf, String> {
    validate_tool(tool)?;
    let path = preset_path(root, tool, id)?;

    let trash_dir = trash_root.join(tool);
    fs::create_dir_all(&trash_dir)
        .map_err(|error| format!("Не удалось создать '{}': {error}", trash_dir.display()))?;

    let target = trash_dir.join(unique_file_name(&trash_dir, id));
    fs::rename(&path, &target).map_err(|error| {
        format!(
            "Не удалось перенести '{}' в '{}': {error}",
            path.display(),
            target.display()
        )
    })?;

    Ok(target)
}

/// Проверяет идентификатор инструмента: он становится именем папки.
fn validate_tool(tool: &str) -> Result<(), String> {
    if !names::is_safe_id(tool) {
        return Err("Недопустимый идентификатор инструмента".to_owned());
    }
    Ok(())
}

/// Проверяет идентификатор пресета: он становится именем файла.
fn validate_id(id: &str) -> Result<(), String> {
    if id.is_empty() {
        return Err("Идентификатор пресета пуст".to_owned());
    }
    if !names::is_safe_id(id) {
        return Err("В идентификаторе пресета допустимы латиница, цифры, '-' и '_'".to_owned());
    }
    Ok(())
}

/// Папка пресетов инструмента: `presets/<tool>/`.
fn tool_dir(root: &Path, tool: &str) -> PathBuf {
    root.join(tool)
}

/// Путь к существующему пресету.
fn preset_path(root: &Path, tool: &str, id: &str) -> Result<PathBuf, String> {
    validate_id(id)?;
    let path = tool_dir(root, tool).join(file_name(id));
    if !path.is_file() {
        return Err(format!("Пресет '{id}' не найден"));
    }
    Ok(path)
}

/// Имя файла пресета по идентификатору.
fn file_name(id: &str) -> String {
    format!("{id}.{EXTENSION}")
}

/// Свободный идентификатор: `base`, `base-2`, `base-3`, …
fn unique_id(dir: &Path, base: &str) -> String {
    unique_stem(dir, base)
}

/// Свободная основа имени файла: занятая получает суффикс `-2`, `-3`, …
fn unique_stem(dir: &Path, base: &str) -> String {
    let mut stem = base.to_owned();
    let mut suffix = 2;
    while dir.join(file_name(&stem)).exists() {
        stem = format!("{base}-{suffix}");
        suffix += 1;
    }
    stem
}

/// Свободное имя файла в корзине: `base.json`, `base-2.json`, …
fn unique_file_name(dir: &Path, base: &str) -> String {
    file_name(&unique_stem(dir, base))
}

/// Читает документ пресета целиком: незнакомые ключи нужны при перезаписи.
fn read_document(path: &Path) -> Result<Map<String, Value>, String> {
    let Some(raw) = read(path)? else {
        return Err(format!(
            "Файл '{}' исчез между чтением папки и чтением пресета",
            path.display()
        ));
    };

    let value: Value = serde_json::from_str(strip_bom(&raw))
        .map_err(|error| format!("Файл '{}' не разобран: {error}", path.display()))?;

    let Value::Object(document) = value else {
        return Err(format!(
            "Файл '{}' должен содержать объект пресета",
            path.display()
        ));
    };
    Ok(document)
}

/// Проверяет, что документ записан этой версией для этого инструмента.
fn ensure_current(document: &Map<String, Value>, path: &Path, tool: &str) -> Result<(), String> {
    let version = document.get("version").and_then(Value::as_u64);
    if version != Some(u64::from(VERSION)) {
        return Err(format!(
            "пресет '{}' записан в версии {}, ожидалась {VERSION}",
            path.display(),
            version
                .map(|version| version.to_string())
                .unwrap_or_else(|| "без номера".to_owned())
        ));
    }

    let document_tool = document.get("tool").and_then(Value::as_str);
    if document_tool != Some(tool) {
        return Err(format!(
            "пресет '{}' относится к инструменту '{}', а не к '{tool}'",
            path.display(),
            document_tool.unwrap_or("не указан")
        ));
    }

    if !matches!(document.get("payload"), Some(Value::Object(_))) {
        return Err(format!(
            "пресет '{}' не содержит настроек: payload должен быть JSON-объектом",
            path.display()
        ));
    }
    Ok(())
}

/// Читает документ для изменения и отказывает чужой версии и чужому инструменту.
///
/// Иначе сохранение перезаписало бы поля файла, формат которого эта версия
/// программы не знает, или настройки другого инструмента.
fn read_current_document(path: &Path, tool: &str) -> Result<Map<String, Value>, String> {
    let document = read_document(path)?;
    ensure_current(&document, path, tool)?;
    Ok(document)
}

/// Пишет документ пресета атомарно: папка может лежать на сетевой шаре.
fn write_document(path: &Path, tool: &str, preset: &Preset) -> Result<(), String> {
    let mut document = Map::new();
    document.insert("version".to_owned(), Value::from(VERSION));
    document.insert("tool".to_owned(), Value::from(tool));
    document.insert("title".to_owned(), Value::from(preset.title.as_str()));
    document.insert("saved_at".to_owned(), Value::from(preset.saved_at.as_str()));
    document.insert("payload".to_owned(), preset.payload.clone());

    write_document_map(path, &document)
}

/// Перезаписывает документ целиком, сохраняя незнакомые ключи.
fn write_document_map(path: &Path, document: &Map<String, Value>) -> Result<(), String> {
    let text = serde_json::to_string_pretty(&Value::Object(document.clone()))
        .map_err(|error| format!("Пресет не сериализован: {error}"))?;
    write_atomic(path, &format!("{text}\n"))
}

/// Название из документа; имя файла — запасной вариант.
fn title_of(document: &Map<String, Value>, fallback: &str) -> String {
    document
        .get("title")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|title| !title.is_empty())
        .unwrap_or(fallback)
        .to_owned()
}

/// Время сохранения из документа; пустая строка — поле отсутствует.
fn saved_at_of(document: &Map<String, Value>) -> String {
    document
        .get("saved_at")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned()
}

/// Настройки из документа; текущая версия гарантирует объект.
fn payload_of(document: &Map<String, Value>) -> Value {
    document
        .get("payload")
        .cloned()
        .unwrap_or(Value::Object(Map::new()))
}

/// Проверяет, что настройки — JSON-объект.
///
/// Список как весь снимок не имеет имён полей и плохо переживает расширение:
/// добавить настройку к массиву нельзя, не сломав читателей.
fn ensure_payload(payload: &Value) -> Result<(), String> {
    if payload.is_object() {
        Ok(())
    } else {
        Err("Настройки пресета должны быть JSON-объектом".to_owned())
    }
}

/// Проверяет и обрезает название.
fn normalize_title(title: &str) -> Result<String, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("Название пресета не может быть пустым".to_owned());
    }
    if title.chars().count() > MAX_TITLE_LEN {
        return Err(format!("Название пресета длиннее {MAX_TITLE_LEN} символов"));
    }
    Ok(title.to_owned())
}

/// Название копии с припиской; приписка обязана влезть в предел длины.
fn copy_title(document: &Map<String, Value>) -> String {
    let base = document
        .get("title")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|title| !title.is_empty())
        .unwrap_or(COPY_FALLBACK);
    let room = MAX_TITLE_LEN.saturating_sub(COPY_SUFFIX.chars().count());
    let base: String = base.chars().take(room).collect();
    format!("{base}{COPY_SUFFIX}")
}

/// Текущее время в UTC: одинаковый вид на любой машине и часовом поясе.
fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

#[cfg(test)]
mod tests {
    //! Проверяется наблюдаемое поведение: что легло в файл, что вернулось
    //! в список и что произошло с папкой при удалении.

    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let path =
            std::env::temp_dir().join(format!("toolbox-presets-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).expect("временная папка");
        path
    }

    fn payload() -> Value {
        serde_json::json!({ "rows": [{ "input": "example.com", "type": "A" }] })
    }

    #[test]
    fn create_writes_envelope_and_translit_id() {
        let root = temp_dir("create");

        let preset = create(&root, "dnslookup", "Продакшн домены", payload()).expect("пресет");

        assert_eq!(preset.id, "prodakshn-domeny");
        assert_eq!(preset.title, "Продакшн домены");
        assert!(preset.saved_at.ends_with('Z'), "время: {}", preset.saved_at);

        let document =
            fs::read_to_string(root.join("dnslookup").join("prodakshn-domeny.json")).expect("файл");
        assert!(document.contains("\"version\": 1"), "файл: {document}");
        assert!(document.contains("\"tool\": \"dnslookup\""), "файл: {document}");
        assert!(document.contains("\"saved_at\""), "файл: {document}");
        assert!(document.contains("\"payload\""), "файл: {document}");
        assert!(document.contains("example.com"), "файл: {document}");
    }

    #[test]
    fn duplicate_title_gets_suffix_and_keeps_payload() {
        let root = temp_dir("duplicate");
        let source = create(&root, "dnslookup", "DNS", payload()).expect("пресет");

        let copy = duplicate(&root, "dnslookup", &source.id, None).expect("копия");

        assert_ne!(copy.id, source.id);
        assert_eq!(copy.title, "DNS (копия)");
        assert_eq!(copy.payload, source.payload);
    }

    #[test]
    fn update_replaces_payload_and_keeps_title_and_foreign_keys() {
        let root = temp_dir("update");
        let preset = create(&root, "dnslookup", "DNS", payload()).expect("пресет");
        let path = root.join("dnslookup").join(file_name(&preset.id));
        fs::write(
            &path,
            "{ \"version\": 1, \"tool\": \"dnslookup\", \"title\": \"DNS\", \
             \"saved_at\": \"2026-01-01T00:00:00Z\", \"payload\": {}, \"note\": \"руками\" }",
        )
        .expect("файл с чужим полем");
        let next = serde_json::json!({ "rows": [] });

        let updated = update(&root, "dnslookup", &preset.id, next.clone()).expect("обновление");

        assert_eq!(updated.title, "DNS", "название не меняется");
        assert_eq!(updated.payload, next);
        let document = fs::read_to_string(&path).expect("файл");
        assert!(document.contains("\"note\": \"руками\""), "файл: {document}");
        assert!(!document.contains("example.com"), "старые настройки ушли: {document}");
    }

    #[test]
    fn update_refuses_foreign_version() {
        // Иначе сохранение перезаписало бы файл, формат которого неизвестен.
        let root = temp_dir("update-foreign");
        let preset = create(&root, "dnslookup", "DNS", payload()).expect("пресет");
        fs::write(
            root.join("dnslookup").join(file_name(&preset.id)),
            "{ \"version\": 99, \"tool\": \"dnslookup\", \"payload\": {} }",
        )
        .expect("чужая версия");

        let error = update(&root, "dnslookup", &preset.id, payload()).expect_err("чужая версия");

        assert!(error.contains("версии 99"), "причина: {error}");
    }

    #[test]
    fn update_refuses_foreign_tool() {
        let root = temp_dir("update-foreign-tool");
        let preset = create(&root, "dnslookup", "DNS", payload()).expect("пресет");
        fs::write(
            root.join("dnslookup").join(file_name(&preset.id)),
            "{ \"version\": 1, \"tool\": \"ping\", \"payload\": {} }",
        )
        .expect("чужой инструмент");

        let error = update(&root, "dnslookup", &preset.id, payload()).expect_err("чужой инструмент");

        assert!(error.contains("ping"), "причина: {error}");
    }

    #[test]
    fn rename_keeps_file_payload_and_unknown_keys() {
        let root = temp_dir("rename");
        let preset = create(&root, "dnslookup", "DNS", payload()).expect("пресет");
        let path = root.join("dnslookup").join(file_name(&preset.id));
        fs::write(
            &path,
            "{ \"version\": 1, \"tool\": \"dnslookup\", \"title\": \"Старое\", \
             \"saved_at\": \"2026-01-01T00:00:00Z\", \"payload\": {}, \"note\": \"руками\" }",
        )
        .expect("файл с чужим полем");

        let renamed = rename(&root, "dnslookup", &preset.id, "DNS клиенты").expect("переименование");

        assert_eq!(renamed.id, preset.id, "файл не двигается");
        let document = fs::read_to_string(&path).expect("файл");
        assert!(document.contains("\"note\": \"руками\""), "файл: {document}");
        assert!(document.contains("\"title\": \"DNS клиенты\""), "файл: {document}");
        assert!(!root.join("dnslookup").join("dns-klienty.json").exists());
    }

    #[test]
    fn delete_moves_preset_to_tool_trash() {
        let root = temp_dir("delete");
        let presets = root.join("profiles").join("work").join("presets");
        let trash = root.join("local").join("trash").join("presets");
        let preset = create(&presets, "dnslookup", "DNS", payload()).expect("пресет");

        let target = delete(&presets, &trash, "dnslookup", &preset.id).expect("удаление");

        assert_eq!(target, trash.join("dnslookup").join("dns.json"));
        assert!(target.is_file(), "пресет должен лежать в корзине");
        assert!(!presets.join("dnslookup").join(file_name(&preset.id)).exists());
        assert!(list(&presets, "dnslookup").expect("список").items.is_empty());
    }

    #[test]
    fn second_delete_does_not_overwrite_trash() {
        // Тот же пресет могли создать заново после удаления.
        let root = temp_dir("trash-twice");
        let presets = root.join("presets");
        let trash = root.join("trash");

        let first = create(&presets, "dnslookup", "DNS", payload()).expect("первый");
        let first_target = delete(&presets, &trash, "dnslookup", &first.id).expect("первое");
        let second = create(&presets, "dnslookup", "DNS", payload()).expect("второй");
        let second_target = delete(&presets, &trash, "dnslookup", &second.id).expect("второе");

        assert_eq!(first_target, trash.join("dnslookup").join("dns.json"));
        assert_eq!(second_target, trash.join("dnslookup").join("dns-2.json"));
    }

    #[test]
    fn broken_preset_does_not_hide_others() {
        let root = temp_dir("broken");
        create(&root, "dnslookup", "DNS", payload()).expect("целый пресет");
        let dir = root.join("dnslookup");
        fs::write(dir.join("broken.json"), "{ \"version\": 1, ").expect("битый файл");
        fs::write(
            dir.join("future.json"),
            "{ \"version\": 99, \"tool\": \"dnslookup\", \"payload\": {} }",
        )
        .expect("чужая версия");
        fs::write(
            dir.join("foreign.json"),
            "{ \"version\": 1, \"tool\": \"ping\", \"payload\": {} }",
        )
        .expect("чужой инструмент");
        // Служебные файлы пресетами не считаются.
        fs::write(dir.join("dns.json.tmp"), "{}").expect("временный файл");

        let list = list(&root, "dnslookup").expect("список");

        assert_eq!(list.items.len(), 1, "пресеты: {:?}", list.items);
        assert_eq!(list.items[0].id, "dns");
        assert_eq!(list.warnings.len(), 3, "замечания: {:?}", list.warnings);
    }

    #[test]
    fn presets_are_sorted_by_title() {
        let root = temp_dir("order");
        create(&root, "dnslookup", "Яндекс", payload()).expect("первый");
        create(&root, "dnslookup", "аномалии", payload()).expect("второй");
        create(&root, "dnslookup", "Боевые", payload()).expect("третий");

        let titles: Vec<String> = list(&root, "dnslookup")
            .expect("список")
            .items
            .into_iter()
            .map(|preset| preset.title)
            .collect();

        assert_eq!(titles, ["аномалии", "Боевые", "Яндекс"]);
    }

    #[test]
    fn tools_keep_their_own_presets() {
        let root = temp_dir("tools");
        create(&root, "dnslookup", "DNS", payload()).expect("dns");
        create(&root, "ping", "Сеть", payload()).expect("ping");

        let dns = list(&root, "dnslookup").expect("dns");
        let ping = list(&root, "ping").expect("ping");

        assert_eq!(dns.items.len(), 1);
        assert_eq!(dns.items[0].title, "DNS");
        assert_eq!(ping.items.len(), 1);
        assert_eq!(ping.items[0].title, "Сеть");
    }

    #[test]
    fn payload_must_be_object() {
        let root = temp_dir("payload");
        let error = create(&root, "dnslookup", "DNS", serde_json::json!(["a"]))
            .expect_err("массив вместо объекта");

        assert!(error.contains("JSON-объектом"), "причина: {error}");
    }

    #[test]
    fn empty_title_is_rejected() {
        let root = temp_dir("empty-title");
        let error =
            create(&root, "dnslookup", "   ", payload()).expect_err("пустое название");

        assert!(error.contains("пустым"), "причина: {error}");
    }

    #[test]
    fn unsafe_tool_is_rejected() {
        let root = temp_dir("unsafe-tool");
        assert!(list(&root, "../evil").is_err(), "путь наружу");
    }

    #[test]
    fn unsafe_preset_id_is_rejected() {
        let root = temp_dir("unsafe-id");
        assert!(
            update(&root, "dnslookup", "../evil", payload()).is_err(),
            "идентификатор наружу"
        );
    }

    #[test]
    fn update_requires_preset() {
        let root = temp_dir("update-missing");
        let error =
            update(&root, "dnslookup", "ghost", payload()).expect_err("нет файла");

        assert!(error.contains("не найден"), "причина: {error}");
    }

    #[test]
    fn copy_title_fits_limit() {
        // Название могло прийти с другой машины: оно тоже обязано влезть.
        let root = temp_dir("copy-title");
        let preset = create(&root, "dnslookup", "DNS", payload()).expect("пресет");
        let path = root.join("dnslookup").join(file_name(&preset.id));
        let document = format!(
            "{{ \"version\": 1, \"tool\": \"dnslookup\", \"title\": \"{}\", \
             \"saved_at\": \"2026-01-01T00:00:00Z\", \"payload\": {{}} }}",
            "Я".repeat(MAX_TITLE_LEN + 10)
        );
        fs::write(&path, document).expect("длинное название");

        let copy = duplicate(&root, "dnslookup", &preset.id, None).expect("копия");

        assert_eq!(copy.title.chars().count(), MAX_TITLE_LEN);
        assert!(copy.title.ends_with(COPY_SUFFIX), "название: {}", copy.title);
    }
}

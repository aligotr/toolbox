//! Словари интерфейса: файлы `local/languages/<code>.jsonc` (ADR 0039, 0059).
//!
//! Файл - JSON с комментариями и висячими запятыми. Разбирает только Rust:
//! у интерфейса и ядра один диалект, а ошибка приходит с номером строки.
//!
//! Встроенных словарей два, `ru` и `en`, и они живут в интерфейсе (ADR 0057).
//! Здесь - только внешние файлы: приложение их **не перезаписывает**.
//! Единственное, что оно пишет само, - файл изменений `<code>.updates.jsonc`.

use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{Map, Value};

use crate::core::infra::error::{fail, AppError, AppResult};
use crate::core::services::trash;
use crate::core::store::files::{ensure_dir, strip_bom, write_atomic};

/// Язык по умолчанию, пока выбор не сделан.
///
/// Встроенный словарь живёт в интерфейсе, ядру нужен только код: иначе
/// блокирующий экран и настройки разошлись бы в значении.
pub const DEFAULT_CODE: &str = "ru";

/// Расширение файла словаря: JSONC допускает комментарии и висячие запятые.
const EXTENSION: &str = "jsonc";

/// Предел кода языка: тег BCP 47 короче, а имя файла должно оставаться
/// читаемым.
const MAX_CODE_LEN: usize = 35;

/// Категории склонения CLDR: других форм в словаре быть не может.
const CATEGORIES: [&str; 6] = ["zero", "one", "two", "few", "many", "other"];

/// Сведения о внешнем словаре вместе с сообщениями.
///
/// Файл читается и разбирается один раз: второй проход за сообщениями
/// не нужен (ADR 0057).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CatalogEntry {
    /// Код языка: имя файла без расширения.
    pub code: String,
    /// Название для списка: поле `name`, иначе код.
    pub name: String,
    /// Причина, по которой файл не прочитан; `None` - словарь годен.
    pub problem: Option<AppError>,
    /// Сообщения годного словаря; у битого - `None`.
    pub messages: Option<Map<String, Value>>,
}

/// Прочитанный словарь.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Language {
    pub code: String,
    pub name: String,
    pub messages: Map<String, Value>,
}

/// Каталог внешних словарей. Отсутствие папки - не поломка: встроенные
/// языки работают и без неё.
pub fn catalog(dir: &Path) -> AppResult<Vec<CatalogEntry>> {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(read_error(dir, &error)),
    };

    let mut found = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| read_error(dir, &error))?;
        let path = entry.path();

        if !path.is_file() {
            continue;
        }
        if path.extension().and_then(|value| value.to_str()) != Some(EXTENSION) {
            continue;
        }
        let Some(code) = path.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };
        // Служебные файлы (`ru.template.jsonc`, `en.updates.jsonc`) словарями
        // не считаются: точка в основе имени означает не код языка.
        if code.contains('.') {
            continue;
        }

        found.push(match read(&path, code) {
            Ok(language) => CatalogEntry {
                code: language.code,
                name: language.name,
                problem: None,
                messages: Some(language.messages),
            },
            Err(problem) => CatalogEntry {
                code: code.to_owned(),
                name: code.to_owned(),
                problem: Some(problem),
                messages: None,
            },
        });
    }

    found.sort_by(|left, right| left.code.cmp(&right.code));
    Ok(found)
}

/// Читает словарь, если файл есть. `None` - встроенный язык без перекрытия.
pub fn load_existing(dir: &Path, code: &str) -> AppResult<Option<Language>> {
    validate_code(code)?;
    let path = file_path(dir, code);
    if !path.exists() {
        return Ok(None);
    }
    read(&path, code).map(Some)
}

/// Выгружает образец словаря и возвращает путь.
///
/// Существующий файл не перезаписывается: правки пользователя важнее
/// свежести шаблона.
pub fn export(dir: &Path, code: &str, document: &Value) -> AppResult<PathBuf> {
    validate_code(code)?;
    if !document.is_object() {
        return fail!(
            "errors.languages.sampleNotObject",
            "Образец словаря должен быть объектом"
        );
    }

    ensure_dir(dir)?;
    let target = dir.join(format!("{code}.template.{EXTENSION}"));
    if target.exists() {
        return fail!(
            "errors.languages.exists",
            format!(
                "Файл '{}' уже существует: образец не перезаписывается",
                target.display()
            ),
            path = target.display(),
        );
    }

    let body = serde_json::to_string_pretty(document).map_err(|error| {
        AppError::new(
            "errors.languages.serialize",
            format!("Образец словаря не сериализован: {error}"),
        )
        .with("reason", error)
    })?;
    let text = format!(
        "// Образец словаря ToolBox.\n\
         //\n\
         // Ключи и подстановки оставьте как есть: по ним программа находит перевод.\n\
         // Файл можно комментировать и дополнять;\n\
         // приложение его не перезаписывает.\n\
         {body}\n"
    );
    write_atomic(&target, &text)?;
    Ok(target)
}

/// Выгружает встроенный язык во внешний файл `<code>.jsonc`.
///
/// Существующий файл не перезаписывается: это уже словарь пользователя.
pub fn export_language(dir: &Path, code: &str, document: &Value) -> AppResult<PathBuf> {
    validate_code(code)?;
    if !document.is_object() {
        return fail!(
            "errors.languages.sampleNotObject",
            "Словарь должен быть объектом"
        );
    }

    ensure_dir(dir)?;
    let target = file_path(dir, code);
    if target.exists() {
        return fail!(
            "errors.languages.existsFile",
            format!(
                "Файл '{}' уже существует: выгрузка не перезаписывает словарь",
                target.display()
            ),
            path = target.display(),
        );
    }

    let body = serialize_document(document)?;
    let text = format!(
        "// Словарь ToolBox.\n\
         //\n\
         // Внешний файл принадлежит пользователю: приложение его не перезаписывает.\n\
         // Ключи и подстановки оставьте как есть: по ним программа находит перевод.\n\
         // Изменения словаря выгружаются отдельным файлом <code>.updates.jsonc с полями add и remove.\n\
         {body}\n"
    );
    write_atomic(&target, &text)?;
    Ok(target)
}

/// Возвращает встроенный язык: переносит внешний файл в корзину.
///
/// Файл изменений убирается до переноса: если перенос не удался, словарь
/// остаётся, а список изменений можно построить заново.
pub fn revert(dir: &Path, trash_dir: &Path, code: &str) -> AppResult<PathBuf> {
    validate_code(code)?;
    let source = file_path(dir, code);
    if !source.is_file() {
        return fail!(
            "errors.languages.missingFile",
            format!("Словаря '{}' нет", source.display()),
            path = source.display(),
        );
    }

    ensure_dir(trash_dir)?;
    let target = trash_dir.join(free_file_name(trash_dir, code));
    fs::rename(&source, &target).map_err(|error| {
        AppError::new(
            "errors.files.move",
            format!(
                "Не удалось перенести '{}' в '{}': {error}",
                source.display(),
                target.display()
            ),
        )
        .with("path", source.display())
        .with("target", target.display())
        .with("reason", error)
    })?;

    trash::stamp(&target);

    Ok(target)
}

/// Возвращает встроенный язык вместе с уборкой файла изменений.
///
/// Порядок задан здесь, а не в команде: файл изменений относится
/// к внешнему словарю и устаревает раньше, чем словарь покидает папку.
/// При отказе переноса описание исчезнувшего словаря не остаётся.
pub fn revert_builtin(dir: &Path, trash_dir: &Path, code: &str) -> AppResult<PathBuf> {
    updates_write(dir, code, None)?;
    revert(dir, trash_dir, code)
}

/// Итог записи файла изменений.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct UpdatesResult {
    /// Путь файла; `None`, если изменений нет и файл убран.
    pub path: Option<String>,
    /// Файл создан или обновлён; ложь - уже был актуален.
    pub written: bool,
    /// Сколько строк в файле изменений; ноль, если файла нет.
    pub count: usize,
    /// Сколько ключей добавить.
    pub added: usize,
    /// Сколько ключей убрать.
    pub removed: usize,
}

/// Путь файла изменений: `<code>.updates.jsonc`.
pub fn updates_path(dir: &Path, code: &str) -> PathBuf {
    dir.join(format!("{code}.updates.{EXTENSION}"))
}

/// Убирает файл, если он есть: отсутствие не ошибка.
fn remove_if_exists(path: &Path) -> AppResult<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(AppError::new(
            "errors.languages.updatesRemove",
            format!("Не удалось убрать '{}': {error}", path.display()),
        )
        .with("path", path.display())
        .with("reason", error)),
    }
}

/// Пишет файл изменений или убирает его, если писать нечего.
///
/// `add` - что добавить, `remove` - что убрать. Текст детерминирован,
/// поэтому актуальный файл сравнивается побайтово и не перезаписывается.
/// Это не словарь: каталог его пропускает.
pub fn updates_write(dir: &Path, code: &str, document: Option<&Value>) -> AppResult<UpdatesResult> {
    validate_code(code)?;
    let target = updates_path(dir, code);

    let Some(document) = document else {
        remove_if_exists(&target)?;
        return Ok(UpdatesResult {
            path: None,
            written: false,
            count: 0,
            added: 0,
            removed: 0,
        });
    };

    let added = document
        .get("add")
        .and_then(Value::as_object)
        .map(Map::len)
        .unwrap_or(0);
    let removed = document
        .get("remove")
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or(0);
    let count = added + removed;

    let body = serialize_document(document)?;
    let text = format!(
        "// Изменения словаря ToolBox.\n\
         //\n\
         // Файл создаёт программа; правки будут перезаписаны.\n\
         // add - ключи, которых нет в словаре или у которых не хватает форм:\n\
         // добавьте их в свой словарь.\n\
         // remove - ключи, которых больше нет в программе: удалите их из словаря.\n\
         {body}\n"
    );

    if let Ok(current) = fs::read_to_string(&target)
        && current == text
    {
        return Ok(UpdatesResult {
            path: Some(target.display().to_string()),
            written: false,
            count,
            added,
            removed,
        });
    }

    ensure_dir(dir)?;
    write_atomic(&target, &text)?;
    Ok(UpdatesResult {
        path: Some(target.display().to_string()),
        written: true,
        count,
        added,
        removed,
    })
}

/// Сериализует документ словаря с ошибкой, объясняющей путь.
fn serialize_document(document: &Value) -> AppResult<String> {
    serde_json::to_string_pretty(document).map_err(|error| {
        AppError::new(
            "errors.languages.serialize",
            format!("Словарь не сериализован: {error}"),
        )
        .with("reason", error)
    })
}

/// Годен ли код как тег языка и имя файла словаря.
///
/// Проверка структурная, без списка языков: подтеги из латиницы и цифр,
/// разделитель — дефис, первый подтег — буквенный. Такой код безопасен как
/// имя файла, а синтаксис тега окончательно проверяет `Intl` в интерфейсе.
pub fn is_code(code: &str) -> bool {
    if code.is_empty() || code.len() > MAX_CODE_LEN {
        return false;
    }

    let mut parts = code.split('-');
    let language = parts.next().unwrap_or_default();

    (2..=8).contains(&language.len())
        && language.chars().all(|symbol| symbol.is_ascii_alphabetic())
        && parts.all(|part| {
            (1..=8).contains(&part.len())
                && part.chars().all(|symbol| symbol.is_ascii_alphanumeric())
        })
}

/// Проверяет код языка: он становится именем файла.
fn validate_code(code: &str) -> AppResult<()> {
    if is_code(code) {
        Ok(())
    } else {
        fail!(
            "errors.languages.invalidCode",
            format!("недопустимый код языка '{code}'"),
            code = code,
        )
    }
}

/// Путь словаря: `local/languages/<code>.jsonc`.
fn file_path(dir: &Path, code: &str) -> PathBuf {
    dir.join(format!("{code}.{EXTENSION}"))
}

/// Свободное имя словаря в корзине: `en.jsonc`, `en-2.jsonc`, …
///
/// Расширение входит в проверяемое имя: `unique_id` без него увидел бы
/// свободный `en` и вернул имя, совпадающее с лежащим файлом.
fn free_file_name(dir: &Path, code: &str) -> String {
    let mut name = format!("{code}.{EXTENSION}");
    let mut suffix = 2;
    while dir.join(&name).exists() {
        name = format!("{code}-{suffix}.{EXTENSION}");
        suffix += 1;
    }
    name
}

/// Читает и разбирает файл.
fn read(path: &Path, code: &str) -> AppResult<Language> {
    let raw = fs::read_to_string(path).map_err(|error| read_error(path, &error))?;
    parse(code, strip_bom(&raw))
}

/// Отказ чтения с путём: без пути причину не найти.
fn read_error(path: &Path, error: &std::io::Error) -> AppError {
    AppError::new(
        "errors.files.read",
        format!("Не удалось прочитать '{}': {error}", path.display()),
    )
    .with("path", path.display())
    .with("reason", error)
}

/// Причина отказа разбора с номером строки.
///
/// `json5` дописывает позицию в конец своего сообщения по-английски. Хвост
/// срезается: иначе номер строки стоял бы в отчёте дважды, а подпись осталась
/// бы наполовину английской. Сама причина («expected colon») пока приходит
/// из библиотеки: перевод ошибок разбора — отдельный этап (ADR 0039).
fn describe_parse_error(error: json5::Error) -> AppError {
    let text = error.to_string();
    let reason = match text.rfind(" at line ") {
        Some(index) => &text[..index],
        None => &text[..],
    };

    match error.position() {
        Some(position) => AppError::new(
            "errors.languages.parse",
            format!(
                "строка {}, столбец {}: {reason}",
                position.line + 1,
                position.column + 1
            ),
        )
        .with("line", position.line + 1)
        .with("column", position.column + 1)
        .with("reason", reason),
        None => AppError::new("errors.core.unexpected", reason.to_owned())
            .with("reason", reason),
    }
}

/// Разбирает словарь.
///
/// Ошибка разбора называет строку и столбец: без них правка файла
/// превращается в угадывание.
fn parse(code: &str, text: &str) -> AppResult<Language> {
    let value: Value = json5::from_str(text).map_err(describe_parse_error)?;

    let Value::Object(mut root) = value else {
        return fail!(
            "errors.languages.notObject",
            "ожидался объект с полями 'name' и 'messages'"
        );
    };

    let name = match root.remove("name") {
        Some(Value::String(name)) if !name.trim().is_empty() => name,
        _ => code.to_owned(),
    };

    let messages = match root.remove("messages") {
        Some(Value::Object(messages)) => messages,
        Some(_) => {
            return fail!(
                "errors.languages.messagesType",
                "поле 'messages' должно быть объектом"
            );
        }
        None => {
            return fail!("errors.languages.messagesMissing", "нет поля 'messages'");
        }
    };

    for (key, message) in &messages {
        validate_message(key, message)?;
    }

    Ok(Language {
        code: code.to_owned(),
        name,
        messages,
    })
}

/// Значение — строка или набор известных форм склонения.
fn validate_message(key: &str, value: &Value) -> AppResult<()> {
    match value {
        Value::String(_) => Ok(()),
        Value::Object(forms) if !forms.is_empty() => {
            for category in forms.keys() {
                if !CATEGORIES.contains(&category.as_str()) {
                    return fail!(
                        "errors.languages.category",
                        format!(
                            "ключ '{key}': неизвестная категория склонения '{category}'; \
                             допустимы zero, one, two, few, many, other"
                        ),
                        key = key,
                        category = category,
                    );
                }
            }
            if forms.values().all(Value::is_string) {
                Ok(())
            } else {
                fail!(
                    "errors.languages.forms",
                    format!("ключ '{key}': формы должны быть строками"),
                    key = key,
                )
            }
        }
        _ => fail!(
            "errors.languages.message",
            format!("ключ '{key}' должен быть строкой или набором форм"),
            key = key,
        ),
    }
}

#[cfg(test)]
mod tests {
    //! Проверки касаются формата файла и обещаний «не перезаписывать»:
    //! именно из-за них чужие правки теряются незаметно.

    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let path =
            std::env::temp_dir().join(format!("toolbox-languages-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).expect("временная папка");
        path
    }

    const SAMPLE: &str = r#"{
        // Название языка видно в списке.
        "name": "English",
        "messages": {
            "title": "Settings",
            // Висячая запятая допустима.
            "counted": { "one": "{count} file", "other": "{count} files" },
        },
    }"#;

    #[test]
    fn dictionary_with_comments_and_trailing_comma_is_read() {
        let language = parse("en", SAMPLE).expect("словарь разобран");

        assert_eq!(language.code, "en");
        assert_eq!(language.name, "English");
        assert_eq!(language.messages["title"], "Settings");
    }

    #[test]
    fn parse_error_names_line() {
        let error = parse("en", "{\n  \"messages\": {\n    \"a\": },\n}")
            .expect_err("битый словарь не должен читаться");

        assert!(
            error.to_string().contains("строка"),
            "в ошибке должен быть номер строки: {error}"
        );
        assert!(
            !error.to_string().contains("at line"),
            "позиция не повторяется по-английски: {error}"
        );
    }

    #[test]
    fn unknown_plural_category_is_rejected() {
        let error = parse("en", r#"{"messages": {"a": {"fwe": "x"}}}"#)
            .expect_err("опечатка в категории не должна проходить");

        assert!(
            error.to_string().contains("категория"),
            "причина должна быть понятна: {error}"
        );
    }

    #[test]
    fn missing_folder_gives_empty_catalog() {
        let dir = temp_dir("missing").join("languages");
        assert_eq!(catalog(&dir).expect("пустой каталог"), Vec::new());
    }

    #[test]
    fn catalog_reads_jsonc_and_skips_legacy_json() {
        let dir = temp_dir("catalog");
        fs::write(dir.join("en.jsonc"), SAMPLE).expect("словарь");
        fs::write(dir.join("broken.jsonc"), "{").expect("битый словарь");
        fs::write(dir.join("legacy.json"), SAMPLE).expect("старый .json");
        fs::write(dir.join("en.updates.jsonc"), "{}").expect("файл изменений");
        fs::write(dir.join("notes.txt"), "не словарь").expect("чужой файл");

        let items = catalog(&dir).expect("каталог");
        let codes: Vec<_> = items.iter().map(|item| item.code.as_str()).collect();

        assert_eq!(codes, ["broken", "en"], "старый .json не читается");
        assert!(items[0].problem.is_some(), "битый файл объясняет отказ");
        assert!(items[0].messages.is_none(), "у битого нет сообщений");
        assert!(items[1].problem.is_none(), "годный файл без замечаний");
        assert_eq!(
            items[1].messages.as_ref().expect("сообщения")["title"],
            "Settings"
        );
    }

    #[test]
    fn catalog_skips_exported_sample() {
        let dir = temp_dir("sample");
        let document = serde_json::json!({
            "name": "Русский",
            "messages": { "title": "Настройки" }
        });
        export(&dir, "ru", &document).expect("образец записан");

        let items = catalog(&dir).expect("каталог");

        assert!(
            items.is_empty(),
            "образец - не словарь: {:?}",
            items.iter().map(|item| &item.code).collect::<Vec<_>>()
        );
    }

    #[test]
    fn export_does_not_overwrite() {
        let dir = temp_dir("export");
        let document = serde_json::json!({
            "name": "Русский",
            "messages": { "title": "Настройки" }
        });

        let path = export(&dir, "ru", &document).expect("образец записан");
        assert!(path.is_file());
        assert!(
            fs::read_to_string(&path).expect("образец").contains("//"),
            "в образце есть подсказка"
        );

        let error = export(&dir, "ru", &document).expect_err("второй раз - отказ");
        assert!(error.to_string().contains("не перезаписывается"));
    }

    #[test]
    fn export_language_refuses_existing_file() {
        let dir = temp_dir("export-language");
        let document = serde_json::json!({
            "name": "English",
            "messages": { "title": "Settings" }
        });

        let path = export_language(&dir, "en", &document).expect("словарь выгружен");
        assert!(path.is_file());
        assert!(
            fs::read_to_string(&path)
                .expect("словарь")
                .contains("\"name\": \"English\""),
            "документ записан целиком"
        );

        fs::write(&path, SAMPLE).expect("правка пользователя");
        let error =
            export_language(&dir, "en", &document).expect_err("выгрузка не перезаписывает");
        assert!(error.to_string().contains("уже существует"));
        assert_eq!(
            fs::read_to_string(&path).expect("словарь"),
            SAMPLE,
            "файл пользователя не тронут"
        );
    }

    #[test]
    fn revert_moves_dictionary_to_trash() {
        let root = temp_dir("revert");
        let dir = root.join("languages");
        let trash = root.join("trash").join("languages");
        fs::create_dir_all(&dir).expect("папка словарей");
        fs::write(dir.join("en.jsonc"), SAMPLE).expect("словарь");

        let target = revert(&dir, &trash, "en").expect("словарь возвращён");

        assert!(!dir.join("en.jsonc").exists(), "внешний файл убран");
        assert_eq!(target, trash.join("en.jsonc"));
        assert_eq!(
            fs::read_to_string(&target).expect("корзина"),
            SAMPLE,
            "файл уцелел в корзине"
        );
    }

    #[test]
    fn second_revert_keeps_both_files_in_trash() {
        let root = temp_dir("revert-twice");
        let dir = root.join("languages");
        let trash = root.join("trash").join("languages");
        fs::create_dir_all(&dir).expect("папка словарей");

        fs::write(dir.join("en.jsonc"), SAMPLE).expect("первый словарь");
        let first = revert(&dir, &trash, "en").expect("первый возврат");

        fs::write(dir.join("en.jsonc"), SAMPLE).expect("второй словарь");
        let second = revert(&dir, &trash, "en").expect("второй возврат");

        assert_eq!(first, trash.join("en.jsonc"));
        assert_eq!(second, trash.join("en-2.jsonc"));
        assert!(first.is_file() && second.is_file(), "оба файла уцелели");
    }

    #[test]
    fn revert_builtin_removes_updates_file_with_dictionary() {
        let root = temp_dir("revert-builtin");
        let dir = root.join("languages");
        let trash = root.join("trash").join("languages");
        fs::create_dir_all(&dir).expect("папка словарей");
        fs::write(dir.join("en.jsonc"), SAMPLE).expect("словарь");
        let updates = dir.join("en.updates.jsonc");
        fs::write(&updates, "{}").expect("файл изменений");

        let target = revert_builtin(&dir, &trash, "en").expect("словарь возвращён");

        assert!(!updates.exists(), "файл изменений убран");
        assert!(!dir.join("en.jsonc").exists(), "внешний файл убран");
        assert!(target.is_file(), "словарь лежит в корзине");
    }

    #[test]
    fn revert_builtin_clears_updates_before_move_fails() {
        // Порядок: файлы изменений убираются до проверки словаря.
        let root = temp_dir("revert-builtin-order");
        let dir = root.join("languages");
        let trash = root.join("trash").join("languages");
        fs::create_dir_all(&dir).expect("папка словарей");
        let updates = dir.join("en.updates.jsonc");
        fs::write(&updates, "{}").expect("файл изменений");

        let error = revert_builtin(&dir, &trash, "en").expect_err("словаря нет");

        assert_eq!(error.code, "errors.languages.missingFile");
        assert!(!updates.exists(), "файл изменений убран до отказа переноса");
    }

    #[test]
    fn updates_write_is_deterministic_and_removed() {
        let dir = temp_dir("updates-write");
        let document = serde_json::json!({
            "name": "English",
            "add": { "title": "Settings" },
            "remove": ["old.title"]
        });

        let first = updates_write(&dir, "en", Some(&document)).expect("файл записан");
        assert!(first.written, "первый раз файл создан");
        assert!(first.path.is_some());
        assert_eq!(first.added, 1, "посчитан один новый ключ");
        assert_eq!(first.removed, 1, "посчитан один ключ для remove");
        assert_eq!(first.count, 2, "в файле две строки изменений");
        assert!(
            fs::read_to_string(updates_path(&dir, "en"))
                .expect("файл изменений")
                .contains("remove"),
            "в шапке объяснены оба раздела"
        );

        let second = updates_write(&dir, "en", Some(&document)).expect("файл актуален");
        assert!(!second.written, "актуальный файл не переписывается");
        assert_eq!(second.count, 2);

        let removed = updates_write(&dir, "en", None).expect("файл убран");
        assert!(!removed.written);
        assert!(removed.path.is_none());
        assert_eq!(removed.count, 0, "у удалённого файла строк нет");
        assert!(!updates_path(&dir, "en").exists());
    }

    #[test]
    fn load_rejects_path_in_code() {
        let dir = temp_dir("code");

        assert!(
            load_existing(&dir, "../evil").is_err(),
            "разделители пути недопустимы"
        );
    }

    #[test]
    fn code_must_be_language_tag() {
        assert!(is_code("en"));
        assert!(is_code("pt-BR"));
        assert!(is_code("zh-Hans-CN"));
        assert!(!is_code("pt_BR"), "подчёркивание — не разделитель тега");
        assert!(!is_code(""), "пустой код не имя файла");
        assert!(!is_code("r"), "однобуквенный код не язык");
        assert!(!is_code("en-"), "пустой подтег недопустим");
    }
}

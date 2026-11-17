//! Словари интерфейса: файлы `local/languages/<code>.json` (ADR 0039).
//!
//! Файл — JSON с комментариями и висячими запятыми. Разбирает только Rust:
//! у интерфейса и ядра один диалект, а ошибка приходит с номером строки.
//!
//! Приложение внешние словари **не перезаписывает**. Единственное, что оно
//! создаёт само, — английский образец при первой установке; маркер
//! `.seeded` не даёт вернуть файл после осознанного удаления.

use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{Map, Value};

use crate::core::infra::error::{fail, AppError, AppResult};
use crate::core::store::files::{ensure_dir, strip_bom, write_atomic};

/// Язык по умолчанию, пока выбор не сделан.
///
/// Встроенный словарь живёт в интерфейсе, ядру нужен только код: иначе
/// блокирующий экран и настройки разошлись бы в значении.
pub const DEFAULT_CODE: &str = "ru";

/// Расширение файла словаря.
const EXTENSION: &str = "json";

/// Предел кода языка: тег BCP 47 короче, а имя файла должно оставаться
/// читаемым.
const MAX_CODE_LEN: usize = 35;

/// Категории склонения CLDR: других форм в словаре быть не может.
const CATEGORIES: [&str; 6] = ["zero", "one", "two", "few", "many", "other"];

/// Английский словарь, поставляемый с программой.
const SEED_CODE: &str = "en";

/// Метка начальной установки: после неё удалённый словарь не возвращается.
const SEED_MARKER: &str = ".seeded";

/// Содержимое английского словаря. Вшито в бинарник: работает и в `tauri dev`,
/// и в установщике, без зависимости от каталога ресурсов.
const SEED: &str = include_str!("../../../resources/languages/en.json");

/// Сведения о найденном словаре.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LanguageSummary {
    /// Код языка: имя файла без расширения.
    pub code: String,
    /// Название для списка: поле `name`, иначе код.
    pub name: String,
    /// Причина, по которой файл не прочитан; `None` — словарь годен.
    pub problem: Option<AppError>,
}

/// Прочитанный словарь.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Language {
    pub code: String,
    pub name: String,
    pub messages: Map<String, Value>,
}

/// Список словарей в папке. Отсутствие папки — не поломка: только русский.
pub fn list(dir: &Path) -> AppResult<Vec<LanguageSummary>> {
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
        // Служебные файлы (`ru.template.json`, `.seeded`) словарями не
        // считаются: точка в основе имени означает не код языка, а образец.
        if code.contains('.') {
            continue;
        }

        found.push(summary(code, &path));
    }

    found.sort_by(|left, right| left.code.cmp(&right.code));
    Ok(found)
}

/// Читает словарь по коду языка.
pub fn load(dir: &Path, code: &str) -> AppResult<Language> {
    validate_code(code)?;
    read(&file_path(dir, code), code)
}

/// Создаёт английский словарь при первой установке.
///
/// Маркер пишется в любом случае: если файл уже лежал, он остаётся как есть,
/// а после удаления уже не восстанавливается.
pub fn seed(dir: &Path) -> AppResult<()> {
    let marker = dir.join(SEED_MARKER);
    if marker.exists() {
        return Ok(());
    }

    ensure_dir(dir)?;
    let target = file_path(dir, SEED_CODE);
    if !target.exists() {
        write_atomic(&target, SEED)?;
    }
    write_atomic(&marker, "1\n")?;
    Ok(())
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
         // Ключи переименовывать нельзя: это контракт. Подстановки вида {{name}}\n\
         // оставить как есть. Файл можно комментировать и дополнять;\n\
         // приложение его не перезаписывает.\n\
         {body}\n"
    );
    write_atomic(&target, &text)?;
    Ok(target)
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

/// Путь словаря: `local/languages/<code>.json`.
fn file_path(dir: &Path, code: &str) -> PathBuf {
    dir.join(format!("{code}.{EXTENSION}"))
}

/// Читает и разбирает файл.
fn read(path: &Path, code: &str) -> AppResult<Language> {
    let raw = fs::read_to_string(path).map_err(|error| read_error(path, &error))?;
    parse(code, strip_bom(&raw))
}

/// Отказ чтения с путём: без пути причину не найти.
fn read_error(path: &Path, error: &std::io::Error) -> AppError {
    AppError::new(
        "errors.languages.read",
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
        None => AppError::new("errors.languages.parsePlain", reason.to_owned())
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

/// Сведения о файле: годный словарь или причина отказа.
fn summary(code: &str, path: &Path) -> LanguageSummary {
    match read(path, code) {
        Ok(language) => LanguageSummary {
            code: language.code,
            name: language.name,
            problem: None,
        },
        Err(reason) => LanguageSummary {
            code: code.to_owned(),
            name: code.to_owned(),
            problem: Some(reason),
        },
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
    fn missing_folder_gives_empty_list() {
        let dir = temp_dir("missing").join("languages");
        assert_eq!(list(&dir).expect("пустой список"), Vec::new());
    }

    #[test]
    fn list_skips_marker_and_foreign_files() {
        let dir = temp_dir("list");
        fs::write(dir.join("en.json"), SAMPLE).expect("словарь");
        fs::write(dir.join("broken.json"), "{").expect("битый словарь");
        fs::write(dir.join(".seeded"), "1\n").expect("маркер");
        fs::write(dir.join("notes.txt"), "не словарь").expect("чужой файл");

        let items = list(&dir).expect("список");
        let codes: Vec<_> = items.iter().map(|item| item.code.as_str()).collect();

        assert_eq!(codes, ["broken", "en"]);
        assert!(items[0].problem.is_some(), "битый файл объясняет отказ");
        assert!(items[1].problem.is_none(), "годный файл без замечаний");
    }

    #[test]
    fn list_skips_exported_sample() {
        let dir = temp_dir("sample");
        let document = serde_json::json!({
            "name": "Русский",
            "messages": { "title": "Настройки" }
        });
        export(&dir, "ru", &document).expect("образец записан");

        let items = list(&dir).expect("список");

        assert!(
            items.is_empty(),
            "образец — не словарь: {:?}",
            items.iter().map(|item| &item.code).collect::<Vec<_>>()
        );
    }

    #[test]
    fn seed_creates_english_once() {
        let dir = temp_dir("seed").join("languages");

        seed(&dir).expect("первая установка");
        let target = dir.join("en.json");
        assert!(target.is_file(), "английский словарь появился");
        assert!(
            fs::read_to_string(&target).expect("словарь").contains("English"),
            "поставлен английский словарь"
        );

        fs::remove_file(&target).expect("словарь удалён");
        seed(&dir).expect("повторная установка");

        assert!(
            !target.exists(),
            "после осознанного удаления словарь не возвращается"
        );
    }

    #[test]
    fn seed_keeps_existing_dictionary() {
        let dir = temp_dir("seed-keep").join("languages");
        fs::create_dir_all(&dir).expect("папка");
        fs::write(dir.join("en.json"), SAMPLE).expect("правленый словарь");

        seed(&dir).expect("установка");

        let text = fs::read_to_string(dir.join("en.json")).expect("словарь");
        assert_eq!(text, SAMPLE, "правка пользователя не перезаписана");
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

        let error = export(&dir, "ru", &document).expect_err("второй раз — отказ");
        assert!(error.to_string().contains("не перезаписывается"));
    }

    #[test]
    fn load_rejects_path_in_code() {
        let dir = temp_dir("code");

        assert!(load(&dir, "../evil").is_err(), "разделители пути недопустимы");
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

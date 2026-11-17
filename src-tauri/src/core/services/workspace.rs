//! Рабочее пространство: открытые вкладки и раскладка (ADR 0011).
//!
//! Ядро не разбирает содержимое файла. Формат принадлежит интерфейсу:
//! вкладки, колонки и инструменты меняются вместе с оболочкой, и каждая такая
//! правка не должна требовать правки Rust. Проверяется только внешний договор —
//! файл содержит JSON-объект. Это не формальность: массив или строка вместо
//! объекта означали бы, что файл записан кем-то другим, и интерфейс не смог бы
//! отличить «вкладок нет» от «файл испорчен».
//!
//! Запись атомарная и по общим правилам файлов состояния (ADR 0010).

use std::path::Path;

use serde_json::Value;

use crate::core::infra::error::{fail, AppError, AppResult};
use crate::core::store::files::{read, strip_bom, write_atomic};

/// Читает рабочее пространство.
///
/// `Ok(None)` — файла нет: это первый запуск, вкладку создаст интерфейс.
/// Отказ чтения или разбора возвращается причиной: интерфейс покажет её
/// в журнале и начнёт с одной пустой вкладки, а не с пустого окна.
pub fn load(path: &Path) -> AppResult<Option<Value>> {
    let Some(raw) = read(path)? else {
        return Ok(None);
    };

    let value: Value = serde_json::from_str(strip_bom(&raw)).map_err(|error| {
        AppError::new(
            "errors.workspace.broken",
            format!("'{}' не разобран как JSON: {error}", path.display()),
        )
        .with("path", path.display())
        .with("reason", error)
    })?;

    if !value.is_object() {
        return fail!(
            "errors.workspace.notObject",
            format!(
                "'{}' должен содержать объект, а не {}",
                path.display(),
                json_kind(&value)
            ),
            path = path.display(),
        );
    }

    Ok(Some(value))
}

/// Записывает рабочее пространство.
pub fn save(path: &Path, value: &Value) -> AppResult<()> {
    if !value.is_object() {
        return fail!(
            "errors.workspace.saveNotObject",
            format!(
                "Рабочее пространство должно быть объектом, а не {}",
                json_kind(value)
            )
        );
    }

    let text = serde_json::to_string_pretty(value).map_err(|error| {
        AppError::new(
            "errors.workspace.serialize",
            format!("Рабочее пространство не сериализовано: {error}"),
        )
        .with("reason", error)
    })?;
    write_atomic(path, &format!("{text}\n"))
}

/// Название вида JSON для сообщения об ошибке.
///
/// Код ошибки `serde` говорит «invalid type», а пользователю нужно «массив».
fn json_kind(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "логическое значение",
        Value::Number(_) => "число",
        Value::String(_) => "строка",
        Value::Array(_) => "массив",
        Value::Object(_) => "объект",
    }
}

#[cfg(test)]
mod tests {
    //! Проверки касаются границы с интерфейсом: отсутствие файла — не поломка,
    //! а испорченный файл даёт внятную причину. Содержимое вкладок ядро
    //! не разбирает, поэтому и проверять его здесь нечего.

    use std::fs;
    use std::path::PathBuf;

    use serde_json::json;

    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let path =
            std::env::temp_dir().join(format!("toolbox-workspace-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).expect("временная папка");
        path
    }

    #[test]
    fn missing_file_is_a_first_run() {
        let path = temp_dir("missing").join("workspace.json");

        assert_eq!(load(&path).expect("отсутствие файла — не ошибка"), None);
    }

    #[test]
    fn saved_workspace_is_read_back() {
        let path = temp_dir("roundtrip").join("workspace.json");
        let value = json!({
            "version": 1,
            "tabs": [{ "id": "tab-1", "columns": [{ "width": 1, "tools": ["ping"] }] }],
            "activeId": "tab-1"
        });

        save(&path, &value).expect("запись");
        let loaded = load(&path).expect("чтение").expect("файл есть");

        assert_eq!(loaded, value);
        assert!(
            !path.with_extension("json.tmp").exists(),
            "временный файл не должен оставаться"
        );
    }

    #[test]
    fn broken_json_names_the_file() {
        let path = temp_dir("broken").join("workspace.json");
        fs::write(&path, "{ это не json").expect("испорченный файл");

        let error = load(&path).expect_err("испорченный файл — ошибка");

        assert!(
            error.to_string().contains("workspace.json"),
            "в причине должен быть путь: {error}"
        );
    }

    #[test]
    fn empty_file_is_reported_as_broken() {
        let path = temp_dir("empty").join("workspace.json");
        fs::write(&path, "").expect("пустой файл");

        let error = load(&path).expect_err("пустой файл — ошибка");

        assert!(
            error.to_string().contains("не разобран как JSON"),
            "причина должна называть разбор: {error}"
        );
    }

    #[test]
    fn bom_from_hand_edited_file_is_ignored() {
        let path = temp_dir("bom").join("workspace.json");
        fs::write(&path, "\u{feff}{ \"version\": 1, \"tabs\": [] }").expect("файл с BOM");

        let loaded = load(&path).expect("BOM — не поломка").expect("файл есть");

        assert_eq!(loaded["version"], json!(1));
    }

    #[test]
    fn array_instead_of_object_is_rejected() {
        let path = temp_dir("array").join("workspace.json");
        fs::write(&path, "[1, 2, 3]").expect("массив");

        let error = load(&path).expect_err("массив — ошибка");

        assert!(
            error.to_string().contains("массив"),
            "вид значения в причине: {error}"
        );
    }

    #[test]
    fn saving_something_other_than_object_is_rejected() {
        let path = temp_dir("save-array").join("workspace.json");

        let error = save(&path, &json!(["вкладки"])).expect_err("массив не должен записываться");

        assert!(
            error.to_string().contains("объектом"),
            "причина отказа: {error}"
        );
        assert!(!path.exists(), "испорченный файл не создаётся");
    }
}

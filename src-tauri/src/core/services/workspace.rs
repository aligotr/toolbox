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

use std::collections::HashSet;
use std::fs;
use std::io::ErrorKind;
use std::path::Path;

use serde_json::Value;

use crate::core::infra::error::{fail, AppError, AppResult};
use crate::core::services::profiles;
use crate::core::store::files::{read, strip_bom, write_atomic};

/// Итог уборки рабочих пространств.
///
/// Удалённое и постороннее возвращаются именами: точка сборки пишет их
/// в лог, а сервис не решает, что считать важным.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct WorkspacePrune {
    /// Имена удалённых файлов.
    pub removed: Vec<String>,
    /// Имена каталогов и ссылок: уборка их не трогает.
    pub foreign: Vec<String>,
}

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
            "errors.files.broken",
            format!("'{}' не разобран как JSON: {error}", path.display()),
        )
        .with("path", path.display())
        .with("reason", error)
    })?;

    if !value.is_object() {
        return fail!(
            "errors.files.notObject",
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

/// Удаляет рабочее пространство профиля, если оно есть.
///
/// Отсутствие файла — не ошибка: у профиля могло не быть вкладок.
pub fn forget(path: &Path) -> AppResult<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => fail!(
            "errors.storage.remove",
            format!("Не удалось удалить '{}': {error}", path.display()),
            path = path.display(),
            reason = error,
        ),
    }
}

/// Убирает рабочие пространства, у которых нет живого профиля.
///
/// В `local/workspaces/` остаются только `<id>.json` профилей из
/// `profiles/`. Всё остальное — следы удалённых профилей, прерванной записи
/// и синхронизации; каталоги и ссылки не трогаются и возвращаются
/// вызывающему для предупреждения.
///
/// Список профилей читается до удаления: при недоступной папке профилей
/// уборка не должна принять живые вкладки за чужие.
pub fn prune(workspaces_dir: &Path, profiles_dir: &Path) -> AppResult<WorkspacePrune> {
    // Список берётся у профилей: правило «что считать профилем» живёт там,
    // а уборка не должна решать его заново.
    let live: HashSet<String> = profiles::ids(profiles_dir)?.into_iter().collect();
    let mut report = WorkspacePrune::default();

    let entries = match fs::read_dir(workspaces_dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(report),
        Err(error) => return Err(read_folder_error(workspaces_dir, &error)),
    };

    for entry in entries {
        let entry = entry.map_err(|error| read_folder_error(workspaces_dir, &error))?;
        let path = entry.path();
        let name = path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default();
        let file_type = entry
            .file_type()
            .map_err(|error| read_folder_error(workspaces_dir, &error))?;

        if file_type.is_dir() || file_type.is_symlink() {
            report.foreign.push(name);
            continue;
        }
        if !file_type.is_file() {
            continue;
        }

        let belongs = path
            .extension()
            .is_some_and(|extension| extension == "json")
            && path
                .file_stem()
                .and_then(|stem| stem.to_str())
                .is_some_and(|id| live.contains(id));
        if belongs {
            continue;
        }

        forget(&path)?;
        report.removed.push(name);
    }

    Ok(report)
}

/// Отказ прочитать папку раскладки: путь и причина словами пользователя.
fn read_folder_error(path: &Path, error: &std::io::Error) -> AppError {
    AppError::new(
        "errors.storage.readFolder",
        format!("Не удалось прочитать '{}': {error}", path.display()),
    )
    .with("path", path.display())
    .with("reason", error)
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

    #[test]
    fn forget_removes_file_and_ignores_absence() {
        let path = temp_dir("forget").join("work.json");

        forget(&path).expect("отсутствие файла — не ошибка");
        fs::write(&path, "{}").expect("файл");

        forget(&path).expect("удаление");

        assert!(!path.exists(), "файл удалён");
    }

    #[test]
    fn prune_keeps_live_and_removes_junk() {
        let root = temp_dir("prune");
        let profiles = root.join("profiles");
        let workspaces = root.join("workspaces");
        fs::create_dir_all(profiles.join("work")).expect("живой профиль");
        fs::create_dir_all(profiles.join("home")).expect("второй профиль");
        fs::create_dir_all(&workspaces).expect("папка рабочих пространств");

        let live = workspaces.join("work.json");
        let second = workspaces.join("home.json");
        fs::write(&live, "{}").expect("живой файл");
        fs::write(&second, "{}").expect("второй живой файл");
        fs::write(workspaces.join("gone.json"), "{}").expect("осиротевший");
        fs::write(workspaces.join("notes.json"), "{}").expect("чужое имя");
        fs::write(workspaces.join("work.json.tmp"), "{}").expect("временный");
        fs::write(workspaces.join("work"), "{}").expect("без расширения");
        let folder = workspaces.join("folder");
        fs::create_dir_all(&folder).expect("каталог");

        let report = prune(&workspaces, &profiles).expect("уборка");

        assert!(live.is_file() && second.is_file(), "живые файлы остались");
        assert!(!workspaces.join("gone.json").exists());
        assert!(!workspaces.join("notes.json").exists());
        assert!(!workspaces.join("work.json.tmp").exists());
        assert!(!workspaces.join("work").exists());
        assert!(folder.is_dir(), "каталог не тронут");
        assert_eq!(report.foreign, ["folder"]);
        assert_eq!(report.removed.len(), 4);
    }

    #[test]
    fn prune_skips_when_profiles_unreadable() {
        let root = temp_dir("prune-noprofiles");
        let workspaces = root.join("workspaces");
        let profiles = root.join("profiles");
        fs::create_dir_all(&workspaces).expect("папка рабочих пространств");
        fs::write(workspaces.join("work.json"), "{}").expect("файл");
        fs::write(&profiles, "не папка").expect("мешающий файл");

        let error =
            prune(&workspaces, &profiles).expect_err("без списка профилей уборка запрещена");

        assert_eq!(error.code, "errors.files.read");
        assert!(workspaces.join("work.json").is_file(), "вкладки не тронуты");
    }
}

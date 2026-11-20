//! Команды словарей интерфейса: каталог, чтение и действия (ADR 0039, 0057).
//!
//! Разбор JSONC - на стороне Rust: один диалект на обе стороны, а ошибка
//! приходит с номером строки. Встроенные `ru` и `en` живут в интерфейсе,
//! здесь - только внешние файлы.

use serde_json::{Map, Value};
use tauri::State;

use crate::core::infra::bus::MessageBus;
use crate::core::infra::error::AppResult;
use crate::core::infra::notifications::{self, Notification, NotificationKind};
use crate::core::runtime::Runtime;
use crate::core::services::languages;
use crate::core::services::trash;

/// Каталог внешних словарей: файл читается и разбирается один раз.
///
/// Отсутствие папки или файлов - норма: работают встроенные языки.
#[tauri::command]
pub(crate) fn languages_catalog(
    runtime: State<'_, Runtime>,
) -> AppResult<Vec<languages::CatalogEntry>> {
    let storage = runtime.require_storage()?;
    languages::catalog(&storage.languages_dir())
}

/// Читает внешний словарь; `None` - файла нет, работает встроенный язык.
#[tauri::command]
pub(crate) fn language_load(
    runtime: State<'_, Runtime>,
    code: String,
) -> AppResult<Option<languages::Language>> {
    let storage = runtime.require_storage()?;
    languages::load_existing(&storage.languages_dir(), &code)
}

/// Выгружает образец словаря; существующий файл не перезаписывается.
#[tauri::command]
pub(crate) fn language_export(
    runtime: State<'_, Runtime>,
    code: String,
    document: Value,
) -> AppResult<String> {
    let storage = runtime.require_storage()?;
    let path = languages::export(&storage.languages_dir(), &code, &document)?;
    Ok(path.display().to_string())
}

/// Выгружает встроенный язык во внешний файл `<code>.jsonc`.
#[tauri::command]
pub(crate) fn language_export_file(
    runtime: State<'_, Runtime>,
    code: String,
    document: Value,
) -> AppResult<String> {
    let storage = runtime.require_storage()?;
    let path = languages::export_language(&storage.languages_dir(), &code, &document)?;
    Ok(path.display().to_string())
}

/// Возвращает встроенный язык: внешний словарь удаляется из списка.
#[tauri::command]
pub(crate) fn language_revert(
    runtime: State<'_, Runtime>,
    code: String,
) -> AppResult<String> {
    let storage = runtime.require_storage()?;

    let target = languages::revert_builtin(
        &storage.languages_dir(),
        &storage.languages_trash_dir(),
        &code,
    )?;

    trash::sweep_after(storage, &target);

    Ok(target.display().to_string())
}

/// Пишет файл недостающих ключей; `document` = `null` убирает его.
///
/// Файл создаётся программой, поэтому уведомление отправляется отсюда,
/// а не из интерфейса: факт принадлежит ядру (ADR 0058).
#[tauri::command]
pub(crate) fn language_missing_write(
    runtime: State<'_, Runtime>,
    bus: State<'_, MessageBus>,
    code: String,
    document: Option<Value>,
) -> AppResult<languages::MissingResult> {
    let storage = runtime.require_storage()?;
    let result = languages::missing_write(&storage.languages_dir(), &code, document.as_ref())?;

    if result.written {
        // Имя файла, а не полный путь: тост должен назвать выгруженный файл,
        // но длинный путь в нём не помещается.
        let file = languages::missing_path(&storage.languages_dir(), &code)
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default();

        let mut params = Map::new();
        params.insert("count".to_owned(), Value::from(result.count));
        params.insert("file".to_owned(), Value::from(file));
        notifications::send(
            &bus,
            Notification::new(
                NotificationKind::Info,
                "notifications.languages.missingWritten",
            )
            .with_params(params)
            .with_group(format!("language-missing-{code}")),
        );
    }

    Ok(result)
}

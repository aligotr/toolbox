//! Команды словарей интерфейса: список, чтение и выгрузка образца.
//!
//! Разбор JSONC — на стороне Rust: один диалект на обе стороны, а ошибка
//! приходит с номером строки (ADR 0039).

use serde_json::Value;
use tauri::State;

use crate::core::infra::error::AppResult;
use crate::core::runtime::Runtime;
use crate::core::services::languages;

/// Список словарей интерфейса из `local/languages/`.
///
/// Отсутствие папки или файлов — норма: остаётся встроенный русский.
#[tauri::command]
pub(crate) fn languages_list(
    runtime: State<'_, Runtime>,
) -> AppResult<Vec<languages::LanguageSummary>> {
    let storage = runtime.require_storage()?;
    languages::list(&storage.languages_dir())
}

/// Читает внешний словарь: интерфейс получает готовый объект.
#[tauri::command]
pub(crate) fn language_load(
    runtime: State<'_, Runtime>,
    code: String,
) -> AppResult<languages::Language> {
    let storage = runtime.require_storage()?;
    languages::load(&storage.languages_dir(), &code)
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

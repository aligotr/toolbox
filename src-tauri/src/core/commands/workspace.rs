//! Команды рабочего пространства: чтение и запись `local/workspace.json`.
//!
//! Содержимое файла непрозрачно: формат принадлежит интерфейсу, поэтому
//! правка раскладки не требует правки Rust (ADR 0011).

use serde_json::Value;
use tauri::State;

use crate::core::infra::error::AppResult;
use crate::core::runtime::Runtime;
use crate::core::services::workspace;

/// Читает рабочее пространство для интерфейса.
///
/// `null` — файла ещё нет: первый запуск, вкладку создаст оболочка.
/// Остальные отказы возвращаются текстом: интерфейс запишет причину
/// в журнал и начнёт с одной пустой вкладки.
#[tauri::command]
pub(crate) fn workspace_load(runtime: State<'_, Runtime>) -> AppResult<Option<Value>> {
    let storage = runtime.require_storage()?;
    workspace::load(&storage.workspace_path())
}

/// Сохраняет рабочее пространство.
///
/// Ядро проверяет только «это объект»: формат разбирает интерфейс.
#[tauri::command]
pub(crate) fn workspace_save(runtime: State<'_, Runtime>, data: Value) -> AppResult<()> {
    let storage = runtime.require_storage()?;
    workspace::save(&storage.workspace_path(), &data)?;
    log::debug!("Рабочее пространство сохранено");
    Ok(())
}

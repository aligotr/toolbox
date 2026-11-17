//! Команды пресетов инструментов: список, операции и пресет по умолчанию.
//!
//! Ядро хранит только конверт: что означает `payload`, знает инструмент
//! (ADR 0028). Поэтому команды передают настройки как `Value` без разбора.

use serde_json::Value;
use tauri::State;

use crate::core::infra::error::AppResult;
use crate::core::runtime::Runtime;
use crate::core::services::presets;

/// Список пресетов инструмента в активном профиле.
///
/// Замечания о непрочитанных файлах идут вместе со списком: испорченный
/// пресет не мешает остальным, но пользователь должен знать, что он был.
#[tauri::command]
pub(crate) fn presets_list(
    runtime: State<'_, Runtime>,
    tool: String,
) -> AppResult<presets::PresetList> {
    let storage = runtime.require_storage()?;
    presets::list(&storage.presets_dir(), &tool)
}

/// Пресет по умолчанию для инструмента активного профиля.
///
/// `id = null` — умолчание не задано: новая вкладка открывается пустой, как и
/// раньше. Указатель лежит в `profile.json`, поэтому виден только активному
/// профилю и синхронизируется вместе с ним.
#[tauri::command]
pub(crate) fn preset_default_get(
    runtime: State<'_, Runtime>,
    tool: String,
) -> AppResult<presets::PresetDefault> {
    let storage = runtime.require_storage()?;
    presets::default_for(&storage.active_profile_dir(), &tool)
}

/// Назначает или снимает пресет по умолчанию.
///
/// Существование пресета проверяет домен пресетов: указатель в пустоту
/// открывал бы вкладку с предупреждением на каждом запуске.
#[tauri::command]
pub(crate) fn preset_default_set(
    runtime: State<'_, Runtime>,
    tool: String,
    id: Option<String>,
) -> AppResult<Option<String>> {
    let storage = runtime.require_storage()?;
    let assigned = presets::set_default(
        &storage.active_profile_dir(),
        &storage.presets_dir(),
        &tool,
        id.as_deref(),
    )?;

    log::info!(
        "Пресет по умолчанию для '{tool}': {}",
        assigned.as_deref().unwrap_or("не задан")
    );
    Ok(assigned)
}

/// Сохраняет текущие настройки инструмента новым пресетом.
#[tauri::command]
pub(crate) fn preset_create(
    runtime: State<'_, Runtime>,
    tool: String,
    title: String,
    payload: Value,
) -> AppResult<presets::Preset> {
    let storage = runtime.require_storage()?;
    presets::create(&storage.presets_dir(), &tool, &title, payload)
}

/// Заменяет настройки пресета; название остаётся прежним.
#[tauri::command]
pub(crate) fn preset_update(
    runtime: State<'_, Runtime>,
    tool: String,
    id: String,
    payload: Value,
) -> AppResult<presets::Preset> {
    let storage = runtime.require_storage()?;
    presets::update(&storage.presets_dir(), &tool, &id, payload)
}

/// Переименовывает пресет: файл остаётся на месте.
#[tauri::command]
pub(crate) fn preset_rename(
    runtime: State<'_, Runtime>,
    tool: String,
    id: String,
    title: String,
) -> AppResult<presets::Preset> {
    let storage = runtime.require_storage()?;
    presets::rename(&storage.presets_dir(), &tool, &id, &title)
}

/// Дублирует пресет; приписку к названию копии даёт интерфейс.
#[tauri::command]
pub(crate) fn preset_duplicate(
    runtime: State<'_, Runtime>,
    tool: String,
    id: String,
    suffix: String,
) -> AppResult<presets::Preset> {
    let storage = runtime.require_storage()?;
    presets::duplicate(&storage.presets_dir(), &tool, &id, &suffix)
}

/// Удаляет пресет в `local/trash/presets/<tool>/`.
#[tauri::command]
pub(crate) fn preset_delete(
    runtime: State<'_, Runtime>,
    tool: String,
    id: String,
) -> AppResult<String> {
    let storage = runtime.require_storage()?;
    let target = presets::delete(
        &storage.presets_dir(),
        &storage.presets_trash_dir(),
        &storage.active_profile_dir(),
        &tool,
        &id,
    )?;
    Ok(target.display().to_string())
}

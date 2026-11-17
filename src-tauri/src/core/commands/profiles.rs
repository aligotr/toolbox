//! Команды профилей: список, создание, переименование, удаление, переключение.
//!
//! Активный профиль отдаётся вместе со списком: интерфейсу он нужен всегда
//! рядом, а два отдельных вызова могли бы разойтись между собой.

use serde_json::Value;
use tauri::{AppHandle, State};

use crate::core::infra::error::AppResult;
use crate::core::runtime::Runtime;
use crate::core::services::profiles;
use crate::core::services::settings::{self, Settings};

use super::settings::commit_settings;

/// Список профилей вместе с активным.
#[tauri::command]
pub(crate) fn profiles_list(runtime: State<'_, Runtime>) -> AppResult<profiles::ProfileList> {
    let storage = runtime.require_storage()?;
    Ok(profiles::ProfileList {
        active: runtime
            .settings
            .lock()
            .expect("settings lock")
            .active_profile
            .clone(),
        items: profiles::list(&storage.profiles_dir())?,
    })
}

/// Создаёт профиль из названия: папка получает латинский идентификатор.
#[tauri::command]
pub(crate) fn profile_create(
    runtime: State<'_, Runtime>,
    title: String,
) -> AppResult<profiles::Profile> {
    let storage = runtime.require_storage()?;
    let profile = profiles::create(&storage.profiles_dir(), &title)?;
    log::info!("Создан профиль '{}' ({})", profile.title, profile.id);
    Ok(profile)
}

/// Переименовывает профиль: меняется название, папка остаётся на месте.
#[tauri::command]
pub(crate) fn profile_rename(
    runtime: State<'_, Runtime>,
    id: String,
    title: String,
) -> AppResult<profiles::Profile> {
    let storage = runtime.require_storage()?;
    let profile = profiles::rename(&storage.profiles_dir(), &id, &title)?;
    log::info!("Профиль '{id}' переименован в '{}'", profile.title);
    Ok(profile)
}

/// Удаляет профиль в корзину `local/trash/`.
///
/// Запрет удаления активного профиля — правило домена, поэтому живёт
/// в [`profiles::delete`].
#[tauri::command]
pub(crate) fn profile_delete(runtime: State<'_, Runtime>, id: String) -> AppResult<String> {
    let storage = runtime.require_storage()?;
    let active = runtime
        .settings
        .lock()
        .expect("settings lock")
        .active_profile
        .clone();

    let target = profiles::delete(&storage.profiles_dir(), &storage.trash_dir(), &id, &active)?;
    log::info!("Профиль '{id}' перемещён в '{}'", target.display());
    Ok(target.display().to_string())
}

/// Делает профиль активным.
///
/// Применяется при следующем запуске: сервисы читают папку профиля один раз
/// при старте, и подмена её на ходу оставила бы открытыми файлы прежнего.
/// Перезапуск — отдельная команда, чтобы интерфейс успел сбросить
/// рабочее пространство и показать отказ, если запись настроек не удалась.
#[tauri::command]
pub(crate) fn profile_switch(
    app: AppHandle,
    runtime: State<'_, Runtime>,
    id: String,
) -> AppResult<Settings> {
    let storage = runtime.require_storage()?;
    profiles::validate_id(&id)?;
    profiles::require_exists(&storage.profiles_dir(), &id)?;

    let updated = commit_settings(&app, &runtime, settings::SECTION_PROFILE, |current| {
        settings::apply_patch(
            current,
            settings::SECTION_PROFILE,
            Value::String(id.clone()),
        )
    })?;
    log::info!("Активный профиль переключён на '{id}'");
    Ok(updated)
}

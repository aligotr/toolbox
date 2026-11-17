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
use crate::core::services::workspace;

use super::settings::commit_settings;

/// Список профилей вместе с активным и идентификатором по умолчанию.
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
        default_id: profiles::DEFAULT_ID.to_owned(),
        items: profiles::list(&storage.profiles_dir())?,
    })
}

/// Сколько файлов лежит в каждом профиле.
///
/// Отдельно от списка: сайдбару счётчики не нужны, а обход папок на сетевой
/// шаре не должен задерживать открытие списка.
#[tauri::command]
pub(crate) fn profiles_usage(
    runtime: State<'_, Runtime>,
) -> AppResult<Vec<profiles::ProfileUsage>> {
    let storage = runtime.require_storage()?;
    profiles::usage(&storage.profiles_dir())
}

/// Создаёт профиль из названия: папка получает латинский идентификатор.
#[tauri::command]
pub(crate) fn profile_create(
    runtime: State<'_, Runtime>,
    title: String,
) -> AppResult<profiles::Profile> {
    let storage = runtime.require_storage()?;
    let profile = profiles::create_with(&storage.profiles_dir(), &title, |id| {
        // Идентификатор был свободен, значит файл рабочего пространства
        // с таким именем остался от удалённого профиля. Новый не должен
        // унаследовать чужие вкладки; отказ уборки отменяет создание.
        workspace::forget(&storage.workspace_path_for(id))
    })?;

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

    // Рабочее пространство — машинное состояние, а не данные профиля:
    // в корзину не идёт, но и оставаться без профиля не должно.
    if let Err(error) = workspace::forget(&storage.workspace_path_for(&id)) {
        log::warn!("Рабочее пространство удалённого профиля не очищено: {error}");
    }

    log::info!("Профиль '{id}' перемещён в '{}'", target.display());
    Ok(target.display().to_string())
}

/// Делает профиль активным и перезапускает приложение.
///
/// Применяется при следующем запуске: сервисы читают папку профиля один раз
/// при старте, и подмена её на ходу оставила бы открытыми файлы прежнего.
/// Перезапуск — часть команды: отдельный шаг оставлял бы окно, в котором
/// настройки уже указывают на новый профиль, а сеанс работает со старым.
#[tauri::command]
pub(crate) fn profile_switch(
    app: AppHandle,
    runtime: State<'_, Runtime>,
    id: String,
) -> AppResult<Settings> {
    let storage = runtime.require_storage()?;
    profiles::validate_id(&id)?;
    profiles::require_exists(&storage.profiles_dir(), &id)?;

    // Запись проверяется до настроек: иначе следующий запуск встретит
    // блокирующий экран уже с новым активным профилем.
    storage.probe_profile(&id)?;

    let updated = commit_settings(&app, &runtime, settings::SECTION_PROFILE, |current| {
        settings::apply_patch(
            current,
            settings::SECTION_PROFILE,
            Value::String(id.clone()),
        )
    })?;
    log::info!("Активный профиль переключён на '{id}', перезапуск");
    app.request_restart();
    Ok(updated)
}

//! Команды настроек и их побочные эффекты.
//!
//! Правило «сначала запись, потом память» живёт в `settings::commit`.
//! Здесь остаются побочные эффекты записи: уровень логгера и событие
//! интерфейсу — их знает только адаптер.

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};

use crate::core::infra::error::AppResult;
use crate::core::runtime::Runtime;
use crate::core::services::settings::{self, Settings};

/// Текущие настройки целиком: интерфейс читает их при открытии экранов.
#[tauri::command]
pub(crate) fn settings_get(runtime: State<'_, Runtime>) -> Settings {
    runtime.settings.lock().expect("settings lock").clone()
}

/// Частичное обновление: меняется только названный раздел.
///
/// Раздел присылается отдельно, а не всем документом: две панели, сохраняющие
/// одновременно, иначе затирали бы правки друг друга.
#[tauri::command]
pub(crate) fn settings_set(
    app: AppHandle,
    runtime: State<'_, Runtime>,
    section: String,
    value: Value,
) -> AppResult<Settings> {
    let updated = commit_settings(&app, &runtime, &section, |current| {
        settings::apply_patch(current, &section, value)
    })?;
    log::debug!("Настройки обновлены: раздел '{section}'");
    Ok(updated)
}

/// Применяет изменение настроек, сохраняет файл и сообщает интерфейсу.
///
/// Вызывается командами настроек, профилей и окна: геометрия окна пишется
/// тем же путём, что и правки из интерфейса, поэтому проверка типов
/// и событие у них общие.
pub(crate) fn commit_settings(
    app: &AppHandle,
    runtime: &Runtime,
    section: &str,
    change: impl FnOnce(&Settings) -> AppResult<Settings>,
) -> AppResult<Settings> {
    let storage = runtime.require_storage()?;

    let mut guard = runtime.settings.lock().expect("settings lock");
    let committed = settings::commit(&storage.settings_path(), &mut guard, change)?;
    drop(guard);

    if committed.log_level_changed
        && let Some(logger) = runtime.logger.as_ref()
    {
        logger.set_level(committed.settings.log.level);
    }

    emit_settings_changed(app, section);
    Ok(committed.settings)
}

/// Сообщение «настройки изменились» с именем раздела.
///
/// Недоставка не отменяет сохранение: файл уже записан, и интерфейс может
/// перечитать настройки вручную. Поэтому отказ только логируется.
fn emit_settings_changed(app: &AppHandle, section: &str) {
    #[derive(Clone, Serialize)]
    struct Changed<'a> {
        section: &'a str,
    }

    if let Err(error) = app.emit(settings::CHANGED_TOPIC, Changed { section }) {
        log::error!(
            "Не удалось отправить '{}' в интерфейс: {error}",
            settings::CHANGED_TOPIC
        );
    }
}

//! Данные инструментов: удаление (ADR 0010).
//!
//! Инструмент сам решает, что положить в `profiles/<id>/data/<tool>/`:
//! ядро не разбирает содержимое и не знает формата. Здесь только действие,
//! которое нужно экрану настроек, — убрать данные одного инструмента.
//!
//! Удаление — переносом в `local/trash/data/`: данные инструмента бывают
//! единственной копией списка, и промах в списке не должен её стирать.

use std::fs;
use std::path::{Path, PathBuf};

use crate::core::infra::error::{fail, AppError, AppResult};
use crate::core::store::files::ensure_dir;
use crate::core::store::{names, storage};

/// Переносит данные инструмента в корзину и возвращает путь назначения.
///
/// Папки нет — ошибка: молчаливое «удалено» скрыло бы опечатку в имени
/// инструмента, а данные остались бы на месте.
pub fn clear_tool(profile_dir: &Path, trash_dir: &Path, tool: &str) -> AppResult<PathBuf> {
    if !names::is_safe_id(tool) {
        return fail!(
            "errors.data.invalidTool",
            "Недопустимый идентификатор инструмента"
        );
    }

    let source = profile_dir.join(storage::DATA_DIR).join(tool);
    if !source.is_dir() {
        return fail!(
            "errors.data.missing",
            format!("Данных инструмента '{tool}' нет"),
            tool = tool,
        );
    }

    ensure_dir(trash_dir)?;

    let target = trash_dir.join(names::unique_id(trash_dir, tool));
    fs::rename(&source, &target).map_err(|error| {
        AppError::new(
            "errors.data.move",
            format!(
                "Не удалось перенести '{}' в '{}': {error}",
                source.display(),
                target.display()
            ),
        )
        .with("path", source.display())
        .with("target", target.display())
        .with("reason", error)
    })?;

    Ok(target)
}

#[cfg(test)]
mod tests {
    //! Проверки касаются удаления: ошибка здесь стирает данные не того
    //! инструмента.

    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("toolbox-data-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).expect("временная папка");
        path
    }

    #[test]
    fn clear_tool_moves_data_to_trash() {
        let root = temp_dir("clear");
        let profile = root.join("profiles").join("work");
        let trash = root.join("local").join("trash").join("data");
        fs::create_dir_all(profile.join("data").join("dns")).expect("данные");
        fs::write(profile.join("data").join("dns").join("a.json"), "{}").expect("файл");

        let target = clear_tool(&profile, &trash, "dns").expect("удаление");

        assert_eq!(target, trash.join("dns"));
        assert!(!profile.join("data").join("dns").exists());
        assert!(target.join("a.json").is_file(), "файл должен уцелеть");
    }

    #[test]
    fn clear_tool_rejects_unknown_and_unsafe() {
        let root = temp_dir("clear-bad");
        let profile = root.join("profiles").join("work");
        fs::create_dir_all(&profile).expect("профиль");
        let trash = root.join("trash");

        assert!(clear_tool(&profile, &trash, "ghost").is_err(), "нет папки");
        assert!(
            clear_tool(&profile, &trash, "../evil").is_err(),
            "путь наружу"
        );
    }
}

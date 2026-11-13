//! Данные инструментов и размеры папок (ADR 0010).
//!
//! Инструмент сам решает, что положить в `profiles/<id>/data/<tool>/`:
//! ядро не разбирает содержимое и не знает формата. Здесь только общие
//! операции, которые нужны экрану настроек: посчитать занятое место
//! и убрать данные одного инструмента.
//!
//! Удаление — переносом в `local/trash/data/`: данные инструмента бывают
//! единственной копией списка, и промах в списке не должен её стирать.
//!
//! Обход папок не идёт по символическим ссылкам: ссылка на родительский
//! каталог превратила бы подсчёт в бесконечный цикл.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use super::{names, storage};

/// Сколько файлов и байт занято.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
pub struct DirStats {
    pub files: u64,
    pub bytes: u64,
}

/// Данные одного инструмента.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ToolStats {
    /// Идентификатор инструмента: имя папки в `data/`.
    pub id: String,
    pub files: u64,
    pub bytes: u64,
}

/// Размеры того, что показывает раздел «Данные».
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct StorageStats {
    pub logs: DirStats,
    pub templates: DirStats,
    pub tools: Vec<ToolStats>,
}

/// Занятое место профилем: шаблоны, пресеты и данные инструментов.
///
/// Отдельная структура, а не [`StorageStats`]: профилю не нужны размеры
/// логов и разбивка по инструментам, а списку профилей — только счётчики.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
pub struct ProfileUsage {
    pub templates: u64,
    pub presets: u64,
    pub data_files: u64,
}

/// Считает файлы и байты в папке рекурсивно.
///
/// Отсутствующая папка — ноль, а не ошибка: данных может не быть вовсе.
/// Временные `*.tmp` не считаются: это недописанный файл, а не данные.
pub fn dir_stats(dir: &Path) -> DirStats {
    let mut stats = DirStats::default();
    walk(dir, &mut stats);
    stats
}

fn walk(dir: &Path, stats: &mut DirStats) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        if file_type.is_symlink() {
            continue;
        }

        let path = entry.path();
        if file_type.is_dir() {
            walk(&path, stats);
            continue;
        }

        if !file_type.is_file() {
            continue;
        }

        if entry.file_name().to_string_lossy().ends_with(".tmp") {
            continue;
        }

        stats.files += 1;
        if let Ok(metadata) = entry.metadata() {
            stats.bytes += metadata.len();
        }
    }
}

/// Считает занятое место профилем: шаблоны, пресеты и данные инструментов.
pub fn profile_usage(profile_dir: &Path) -> ProfileUsage {
    ProfileUsage {
        templates: dir_stats(&profile_dir.join(storage::TEMPLATES_DIR)).files,
        presets: dir_stats(&profile_dir.join(storage::PRESETS_DIR)).files,
        data_files: dir_stats(&profile_dir.join(storage::DATA_DIR)).files,
    }
}

/// Готовит размеры для раздела «Данные».
pub fn stats(logs_dir: &Path, templates_dir: &Path, data_dir: &Path) -> StorageStats {
    StorageStats {
        logs: dir_stats(logs_dir),
        templates: dir_stats(templates_dir),
        tools: tools(data_dir),
    }
}

/// Перечисляет данные инструментов, у которых папка непустая.
///
/// Чужие каталоги с недопустимым именем пропускаются: идентификатор
/// инструмента — такое же безопасное имя, как идентификатор профиля.
fn tools(data_dir: &Path) -> Vec<ToolStats> {
    let Ok(entries) = fs::read_dir(data_dir) else {
        return Vec::new();
    };

    let mut tools = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let Some(id) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if !names::is_safe_id(id) {
            continue;
        }

        let stats = dir_stats(&path);
        if stats.files == 0 {
            continue;
        }

        tools.push(ToolStats {
            id: id.to_owned(),
            files: stats.files,
            bytes: stats.bytes,
        });
    }

    tools.sort_by(|left, right| left.id.cmp(&right.id));
    tools
}

/// Переносит данные инструмента в корзину и возвращает путь назначения.
///
/// Папки нет — ошибка: молчаливое «удалено» скрыло бы опечатку в имени
/// инструмента, а данные остались бы на месте.
pub fn clear_tool(profile_dir: &Path, trash_dir: &Path, tool: &str) -> Result<PathBuf, String> {
    if !names::is_safe_id(tool) {
        return Err("Недопустимый идентификатор инструмента".to_owned());
    }

    let source = profile_dir.join(storage::DATA_DIR).join(tool);
    if !source.is_dir() {
        return Err(format!("Данных инструмента '{tool}' нет"));
    }

    fs::create_dir_all(trash_dir)
        .map_err(|error| format!("Не удалось создать '{}': {error}", trash_dir.display()))?;

    let target = trash_dir.join(names::unique_id(trash_dir, tool));
    fs::rename(&source, &target).map_err(|error| {
        format!(
            "Не удалось перенести '{}' в '{}': {error}",
            source.display(),
            target.display()
        )
    })?;

    Ok(target)
}

#[cfg(test)]
mod tests {
    //! Проверки касаются подсчёта и удаления: ошибка в подсчёте показывает
    //! неверные размеры, ошибка в удалении стирает данные не того инструмента.

    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let path =
            std::env::temp_dir().join(format!("toolbox-data-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).expect("временная папка");
        path
    }

    #[test]
    fn stats_count_nested_files_and_skip_tmp() {
        let dir = temp_dir("stats");
        fs::create_dir_all(dir.join("dns").join("lists")).expect("вложенная папка");
        fs::write(dir.join("dns").join("a.json"), "1234").expect("файл");
        fs::write(dir.join("dns").join("lists").join("b.json"), "12").expect("файл");
        fs::write(dir.join("dns").join("c.json.tmp"), "недописан").expect("временный");

        let stats = dir_stats(&dir.join("dns"));

        assert_eq!(stats.files, 2);
        assert_eq!(stats.bytes, 6);
    }

    #[test]
    fn tools_are_listed_and_unsafe_names_skipped() {
        let dir = temp_dir("tools");
        fs::write(dir.join("README.txt"), "не данные").ok();
        fs::create_dir_all(dir.join("dns")).expect("папка инструмента");
        fs::write(dir.join("dns").join("list.json"), "{}").expect("файл");
        fs::create_dir_all(dir.join("пусто")).expect("папка без файлов");
        fs::create_dir_all(dir.join("чужое имя")).expect("недопустимое имя");

        let tools = tools(&dir);

        assert_eq!(tools.len(), 1, "только инструменты с файлами: {tools:?}");
        assert_eq!(tools[0].id, "dns");
        assert_eq!(tools[0].files, 1);
    }

    #[test]
    fn profile_usage_counts_templates_presets_and_data() {
        let profile = temp_dir("usage");
        fs::create_dir_all(profile.join("templates")).expect("шаблоны");
        fs::write(profile.join("templates").join("dns.json"), "{}").expect("шаблон");
        fs::create_dir_all(profile.join("presets").join("dnslookup")).expect("пресеты");
        fs::write(
            profile.join("presets").join("dnslookup").join("dns.json"),
            "{}",
        )
        .expect("пресет");
        fs::create_dir_all(profile.join("data").join("dns")).expect("данные");
        fs::write(profile.join("data").join("dns").join("a.json"), "{}").expect("файл");

        let usage = profile_usage(&profile);

        assert_eq!(usage.templates, 1);
        assert_eq!(usage.presets, 1);
        assert_eq!(usage.data_files, 1);
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
        assert!(clear_tool(&profile, &trash, "../evil").is_err(), "путь наружу");
    }
}

//! Размеры папок профиля (ADR 0010).
//!
//! Считает файлы и байты там, где они лежат, и не решает, что с числами
//! делать: показ и удаление — дело сервисов. Отсутствующая папка — ноль,
//! а не ошибка: данных может не быть вовсе.
//!
//! Обход не идёт по символическим ссылкам: ссылка на родительский каталог
//! превратила бы подсчёт в бесконечный цикл. Временные `*.tmp` не считаются:
//! это недописанный файл, а не данные.

use std::fs;
use std::path::Path;

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
///
/// Пути берутся у хранилища: три папки — логи, шаблоны активного профиля
/// и данные инструментов — всегда идут вместе, и передавать их порознь
/// значило бы позволить вызывающему собрать произвольный набор.
pub fn summary(storage: &storage::Storage) -> StorageStats {
    StorageStats {
        logs: dir_stats(&storage.logs_dir()),
        templates: dir_stats(&storage.templates_dir()),
        tools: tools(&storage.data_dir()),
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

#[cfg(test)]
mod tests {
    //! Проверки касаются подсчёта: ошибка здесь показывает неверные размеры.

    use super::*;
    use std::path::PathBuf;

    fn temp_dir(tag: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("toolbox-stats-{tag}-{}", std::process::id()));
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
}

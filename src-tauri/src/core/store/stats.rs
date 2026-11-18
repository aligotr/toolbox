//! Размеры папок профиля (ADR 0010).
//!
//! Считает файлы и байты там, где они лежат, и не решает, что с числами
//! делать: показ — дело сервисов. Отсутствующая папка — ноль, а не ошибка:
//! данных может не быть вовсе.
//!
//! Обход не идёт по символическим ссылкам: ссылка на родительский каталог
//! превратила бы подсчёт в бесконечный цикл. Временные `*.tmp` не считаются:
//! это недописанный файл, а не данные.

use std::fs;
use std::path::Path;

use serde::Serialize;

use super::storage;

/// Сколько файлов и байт занято.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
pub struct DirStats {
    pub files: u64,
    pub bytes: u64,
}

/// Занятое место профилем: пресеты и данные инструментов.
///
/// Списку профилей нужны только счётчики: разбивка по инструментам и размеры
/// логов ему не требуются.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
pub struct ProfileUsage {
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

/// Считает занятое место профилем: пресеты и данные инструментов.
pub fn profile_usage(profile_dir: &Path) -> ProfileUsage {
    ProfileUsage {
        presets: dir_stats(&profile_dir.join(storage::PRESETS_DIR)).files,
        data_files: dir_stats(&profile_dir.join(storage::DATA_DIR)).files,
    }
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
    fn profile_usage_counts_presets_and_data() {
        let profile = temp_dir("usage");
        fs::create_dir_all(profile.join("presets").join("dnslookup")).expect("пресеты");
        fs::write(
            profile.join("presets").join("dnslookup").join("dns.json"),
            "{}",
        )
        .expect("пресет");
        fs::create_dir_all(profile.join("data").join("dns")).expect("данные");
        fs::write(profile.join("data").join("dns").join("a.json"), "{}").expect("файл");

        let usage = profile_usage(&profile);

        assert_eq!(usage.presets, 1);
        assert_eq!(usage.data_files, 1);
    }
}

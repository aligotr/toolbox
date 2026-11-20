//! Корзина: внутренняя страховка от промаха при удалении.
//!
//! Верхний уровень корзины повторяет единицу удаления: профиль целиком,
//! отдельный пресет, внешний словарь. Записи живут [`KEEP_DAYS`] дней,
//! затем удаляются при старте и после каждого удаления.
//!
//! `rename` сохраняет время изменения, поэтому после переноса запись
//! получает отметку «удалено сейчас». Иначе старый профиль, удалённый
//! сегодня, выглядел бы просроченным и исчез бы при первом запуске.

use std::fs::{self, File, OpenOptions};
use std::io::{self, ErrorKind};
use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::core::store::storage::{LANGUAGES_DIR, PRESETS_DIR, PROFILES_DIR, Storage};

/// Сколько дней запись лежит в корзине.
pub const KEEP_DAYS: u64 = 14;

/// Секунд в сутках: срок задан в днях, а `SystemTime` считает секунды.
const DAY_SECONDS: u64 = 24 * 60 * 60;

/// Ставит записи время удаления.
///
/// Отказ не отменяет удаление: файл уже лежит в корзине. Причина остаётся
/// в логе; запись уберёт следующая чистка, а не текущая после удаления.
pub fn stamp(path: &Path) {
    let result = open_for_time(path).and_then(|file| file.set_modified(SystemTime::now()));
    if let Err(error) = result {
        log::warn!(
            "Корзина: не удалось отметить время удаления '{}': {error}",
            path.display()
        );
    }
}

/// Чистит корзину приложения.
///
/// Единственная точка входа для запуска: срок и правила живут здесь,
/// а не в вызывающем коде.
pub fn sweep(storage: &Storage) {
    prune_keep(&storage.trash_dir(), None);
}

/// Чистит корзину, не трогая только что перенесённую запись.
///
/// Нужен после удаления: если отметка времени не легла, время изменения
/// осталось старым, и общая чистка приняла бы свежую запись за просроченную.
pub fn sweep_after(storage: &Storage, keep: &Path) {
    prune_keep(&storage.trash_dir(), Some(keep));
}

/// Удаляет из корзины записи старше [`KEEP_DAYS`] дней.
///
/// Возвращает число удалённых единиц: папок профилей, файлов пресетов
/// и словарей. Промежуточные пустые папки не считаются.
#[cfg(test)]
fn prune(root: &Path) -> usize {
    prune_keep(root, None)
}

/// Чистит корзину, пропуская запись `keep`.
fn prune_keep(root: &Path, keep: Option<&Path>) -> usize {
    let cutoff = SystemTime::now()
        .checked_sub(Duration::from_secs(KEEP_DAYS * DAY_SECONDS))
        .unwrap_or(UNIX_EPOCH);

    prune_entries(root, cutoff, keep)
}

/// Обходит корзину по заданному сроку.
fn prune_entries(root: &Path, cutoff: SystemTime, keep: Option<&Path>) -> usize {
    let Some(entries) = read_dir(root) else {
        return 0;
    };

    let mut removed = 0;
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                log::warn!("Корзина: запись не прочитана: {error}");
                continue;
            }
        };
        let path = entry.path();
        if is_kept(&path, keep) {
            continue;
        }
        match entry.file_name().to_str() {
            Some(PROFILES_DIR) => {
                removed += prune_profiles(&path, cutoff, keep);
                remove_empty_dir(&path);
            }
            Some(PRESETS_DIR) | Some(LANGUAGES_DIR) => {
                removed += prune_files(&path, cutoff, keep);
                remove_empty_dir(&path);
            }
            _ => {
                if is_old(&path, cutoff) && remove_unit(&path) {
                    removed += 1;
                }
            }
        }
    }
    removed
}

/// Запись только что перенесена: её срок ещё не наступил.
fn is_kept(path: &Path, keep: Option<&Path>) -> bool {
    keep.is_some_and(|keep| keep == path)
}

/// Читает папку корзины.
///
/// Отсутствие корзины - норма: приложение могло ни разу ничего не удалять.
/// Остальные отказы не отменяют запуск, но оставляют след в логе.
fn read_dir(path: &Path) -> Option<fs::ReadDir> {
    match fs::read_dir(path) {
        Ok(entries) => Some(entries),
        Err(error) if error.kind() == ErrorKind::NotFound => None,
        Err(error) => {
            log::warn!(
                "Корзина: не удалось прочитать '{}': {error}",
                path.display()
            );
            None
        }
    }
}

/// Профиль - единица удаления: папка уходит целиком, а не по файлам.
fn prune_profiles(path: &Path, cutoff: SystemTime, keep: Option<&Path>) -> usize {
    if !path.is_dir() {
        return usize::from(!is_kept(path, keep) && is_old(path, cutoff) && remove_unit(path));
    }

    let Some(entries) = read_dir(path) else {
        return 0;
    };

    let mut removed = 0;
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                log::warn!("Корзина: запись не прочитана: {error}");
                continue;
            }
        };
        let path = entry.path();
        if is_kept(&path, keep) {
            continue;
        }
        if is_old(&path, cutoff) && remove_unit(&path) {
            removed += 1;
        }
    }
    removed
}

/// Пресет и словарь - файлы: срок считается по каждому файлу.
///
/// Проход рекурсивный: старая раскладка `presets/<tool>/<file>` и новая
/// `presets/<profile>/<tool>/<file>` чистятся одинаково. Опустевшие папки
/// убираются, папка с живым файлом остаётся.
fn prune_files(path: &Path, cutoff: SystemTime, keep: Option<&Path>) -> usize {
    if !path.is_dir() {
        return usize::from(!is_kept(path, keep) && is_old(path, cutoff) && remove_unit(path));
    }

    let Some(entries) = read_dir(path) else {
        return 0;
    };

    let mut removed = 0;
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                log::warn!("Корзина: запись не прочитана: {error}");
                continue;
            }
        };
        let path = entry.path();
        if is_kept(&path, keep) {
            continue;
        }
        let kind = match entry.file_type() {
            Ok(kind) => kind,
            Err(error) => {
                log::warn!("Корзина: тип '{}' не определён: {error}", path.display());
                continue;
            }
        };

        if kind.is_dir() {
            removed += prune_files(&path, cutoff, keep);
            remove_empty_dir(&path);
            continue;
        }

        if !(kind.is_file() || kind.is_symlink()) || !is_old(&path, cutoff) {
            continue;
        }
        match fs::remove_file(&path) {
            Ok(()) => removed += 1,
            Err(error) => log::warn!("Корзина: не удалось удалить '{}': {error}", path.display()),
        }
    }
    removed
}

/// Убирает опустевшую промежуточную папку.
///
/// Непустая папка - норма: в ней остались живые записи. Любой другой отказ
/// означает, что корзина не чистится полностью, и попадает в лог.
fn remove_empty_dir(path: &Path) {
    if let Err(error) = fs::remove_dir(path)
        && error.kind() != ErrorKind::DirectoryNotEmpty
    {
        log::warn!(
            "Корзина: не удалось убрать пустую папку '{}': {error}",
            path.display()
        );
    }
}

/// Возраст записи: сравниваем время изменения с сроком.
///
/// `symlink_metadata` не идёт по ссылке: чужой файл за пределами корзины
/// не должен влиять на срок и не должен быть удалён. Пропавшая запись -
/// норма: её могли убрать между чтением папки и проверкой.
fn is_old(path: &Path, cutoff: SystemTime) -> bool {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == ErrorKind::NotFound => return false,
        Err(error) => {
            log::warn!(
                "Корзина: метаданные '{}' не прочитаны: {error}",
                path.display()
            );
            return false;
        }
    };

    let modified = match metadata.modified() {
        Ok(modified) => modified,
        Err(error) => {
            log::warn!("Корзина: время '{}' не прочитано: {error}", path.display());
            return false;
        }
    };

    modified < cutoff
}

/// Удаляет запись целиком: папку с содержимым или файл.
fn remove_unit(path: &Path) -> bool {
    let result = match fs::symlink_metadata(path) {
        Ok(meta) if meta.file_type().is_dir() => fs::remove_dir_all(path),
        _ => fs::remove_file(path),
    };

    match result {
        Ok(()) => true,
        Err(error) => {
            log::warn!("Корзина: не удалось удалить '{}': {error}", path.display());
            false
        }
    }
}

/// Открывает файл или папку только для записи атрибутов.
///
/// На Windows папку нельзя открыть обычным `File::open`: нужен
/// `FILE_FLAG_BACKUP_SEMANTICS`. На остальных платформах хватает `File::open`.
#[cfg(windows)]
fn open_for_time(path: &Path) -> io::Result<File> {
    use std::os::windows::fs::OpenOptionsExt;

    const FILE_WRITE_ATTRIBUTES: u32 = 0x0100;
    const FILE_FLAG_BACKUP_SEMANTICS: u32 = 0x0200_0000;

    OpenOptions::new()
        .access_mode(FILE_WRITE_ATTRIBUTES)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS)
        .open(path)
}

#[cfg(not(windows))]
fn open_for_time(path: &Path) -> io::Result<File> {
    File::open(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("toolbox-trash-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).expect("временная папка");
        path
    }

    fn set_age(path: &Path, days: u64) {
        let when = SystemTime::now() - Duration::from_secs(days * DAY_SECONDS);
        open_for_time(path)
            .expect("открыть для времени")
            .set_modified(when)
            .expect("выставить время");
    }

    fn age(path: &Path) -> Duration {
        SystemTime::now()
            .duration_since(
                fs::metadata(path)
                    .expect("метаданные")
                    .modified()
                    .expect("время"),
            )
            .expect("время не в будущем")
    }

    #[test]
    fn stamp_marks_folder_as_fresh() {
        let root = temp_dir("stamp-folder");
        let folder = root.join("profiles").join("work");
        fs::create_dir_all(&folder).expect("папка профиля");
        set_age(&folder, 30);

        stamp(&folder);

        assert!(age(&folder) < Duration::from_secs(60));
    }

    #[test]
    fn stamp_marks_file_as_fresh() {
        let root = temp_dir("stamp-file");
        let file = root.join("dns.json");
        fs::write(&file, "{}").expect("файл пресета");
        set_age(&file, 30);

        stamp(&file);

        assert!(age(&file) < Duration::from_secs(60));
    }

    #[test]
    fn prune_removes_old_profile_and_keeps_fresh() {
        let root = temp_dir("prune-profiles");
        let old = root.join("profiles").join("old");
        let fresh = root.join("profiles").join("fresh");
        fs::create_dir_all(old.join("presets")).expect("старый профиль");
        fs::create_dir_all(&fresh).expect("свежий профиль");
        set_age(&old, KEEP_DAYS + 1);

        let removed = prune(&root);

        assert_eq!(removed, 1);
        assert!(!old.exists(), "старый профиль удалён");
        assert!(fresh.exists(), "свежий профиль остался");
    }

    #[test]
    fn prune_removes_old_preset_and_keeps_fresh() {
        let root = temp_dir("prune-presets");
        let dir = root.join("presets").join("work").join("dnslookup");
        fs::create_dir_all(&dir).expect("папка пресетов");
        let old = dir.join("old.json");
        let fresh = dir.join("fresh.json");
        fs::write(&old, "{}").expect("старый пресет");
        fs::write(&fresh, "{}").expect("свежий пресет");
        set_age(&old, KEEP_DAYS + 1);

        let removed = prune(&root);

        assert_eq!(removed, 1);
        assert!(!old.exists(), "старый пресет удалён");
        assert!(fresh.exists(), "свежий пресет остался");
        assert!(dir.is_dir(), "папка с живым пресетом осталась");
    }

    #[test]
    fn prune_removes_empty_preset_folders() {
        let root = temp_dir("prune-empty");
        let dir = root.join("presets").join("work").join("dnslookup");
        fs::create_dir_all(&dir).expect("папка пресетов");
        let old = dir.join("old.json");
        fs::write(&old, "{}").expect("старый пресет");
        set_age(&old, KEEP_DAYS + 1);

        prune(&root);

        assert!(!root.join("presets").join("work").exists());
        assert!(!root.join(PRESETS_DIR).exists(), "пустая категория убрана");
    }

    #[test]
    fn prune_removes_old_language() {
        let root = temp_dir("prune-languages");
        let dir = root.join("languages");
        fs::create_dir_all(&dir).expect("папка словарей");
        let old = dir.join("en.jsonc");
        fs::write(&old, "{}").expect("старый словарь");
        set_age(&old, KEEP_DAYS + 1);

        let removed = prune(&root);

        assert_eq!(removed, 1);
        assert!(!old.exists());
    }

    #[test]
    fn prune_removes_old_flat_profile() {
        let root = temp_dir("prune-flat");
        let old = root.join("work");
        fs::create_dir_all(&old).expect("плоский профиль");
        set_age(&old, KEEP_DAYS + 1);

        let removed = prune(&root);

        assert_eq!(removed, 1);
        assert!(!old.exists());
    }

    #[test]
    fn prune_keeps_fresh_unknown_entry() {
        let root = temp_dir("prune-unknown");
        let fresh = root.join("work");
        fs::create_dir_all(&fresh).expect("свежая запись");

        let removed = prune(&root);

        assert_eq!(removed, 0);
        assert!(fresh.exists());
    }

    #[test]
    fn prune_keeps_profile_stamped_after_deletion() {
        // Профиль месяц не менялся, но удалён сегодня: срок идёт от удаления.
        let root = temp_dir("prune-stamped");
        let profile = root.join("profiles").join("work");
        fs::create_dir_all(&profile).expect("профиль");
        set_age(&profile, 30);
        stamp(&profile);

        let removed = prune(&root);

        assert_eq!(removed, 0);
        assert!(profile.exists());
    }

    #[test]
    fn prune_keeps_fresh_preset_inside_old_folder() {
        let root = temp_dir("prune-old-folder");
        let dir = root.join("presets").join("work").join("dnslookup");
        fs::create_dir_all(&dir).expect("папка");
        let fresh = dir.join("fresh.json");
        fs::write(&fresh, "{}").expect("свежий пресет");
        set_age(&dir, KEEP_DAYS + 1);

        let removed = prune(&root);

        assert_eq!(removed, 0);
        assert!(fresh.exists());
        assert!(dir.is_dir());
    }

    #[test]
    fn prune_removes_old_preset_in_old_tool_layout() {
        // Старая раскладка `presets/<tool>/<file>`: профиля в пути нет.
        let root = temp_dir("prune-old-presets");
        let dir = root.join(PRESETS_DIR).join("dnslookup");
        fs::create_dir_all(&dir).expect("папка пресетов");
        let old = dir.join("old.json");
        fs::write(&old, "{}").expect("старый пресет");
        set_age(&old, KEEP_DAYS + 1);

        let removed = prune(&root);

        assert_eq!(removed, 1);
        assert!(!old.exists(), "старый пресет удалён");
        assert!(!dir.exists(), "опустевшая папка убрана");
        assert!(!root.join(PRESETS_DIR).exists(), "пустая категория убрана");
    }

    #[test]
    fn profile_named_presets_does_not_collide_with_preset_category() {
        // Профиль и пресет - разные единицы удаления, даже если имена совпали.
        let root = temp_dir("profile-presets");
        let profile = root.join(PROFILES_DIR).join(PRESETS_DIR);
        fs::create_dir_all(&profile).expect("профиль");
        set_age(&profile, KEEP_DAYS + 1);

        let fresh = root
            .join(PRESETS_DIR)
            .join("work")
            .join("dnslookup")
            .join("fresh.json");
        fs::create_dir_all(fresh.parent().expect("папка пресета")).expect("папка пресетов");
        fs::write(&fresh, "{}").expect("свежий пресет");

        let removed = prune(&root);

        assert_eq!(removed, 1);
        assert!(
            !profile.exists(),
            "профиль с именем presets удалён по сроку"
        );
        assert!(fresh.exists(), "категория пресетов не задета");
    }

    #[test]
    fn prune_keeps_profile_moved_without_stamp() {
        // Отметка времени не легла: запись нельзя принимать за просроченную.
        let root = temp_dir("prune-keep-profile");
        let profile = root.join(PROFILES_DIR).join("work");
        fs::create_dir_all(&profile).expect("профиль");
        set_age(&profile, KEEP_DAYS + 1);

        let removed = prune_keep(&root, Some(&profile));

        assert_eq!(removed, 0);
        assert!(profile.exists(), "только что удалённый профиль уцелел");
    }

    #[test]
    fn prune_keeps_preset_moved_without_stamp() {
        let root = temp_dir("prune-keep-preset");
        let dir = root.join(PRESETS_DIR).join("work").join("dnslookup");
        fs::create_dir_all(&dir).expect("папка пресетов");
        let preset = dir.join("old.json");
        fs::write(&preset, "{}").expect("пресет");
        set_age(&preset, KEEP_DAYS + 1);

        let removed = prune_keep(&root, Some(&preset));

        assert_eq!(removed, 0);
        assert!(preset.exists(), "только что удалённый пресет уцелел");
    }
}

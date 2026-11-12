//! Файлы состояния: настройки, рабочее пространство (ADR 0010).
//!
//! Общие правила чтения и записи вынесены сюда, потому что ошибка в них
//! ломает сразу все файлы: папку программы копируют целиком и синхронизируют,
//! поэтому половина записанного файла — это постоянная поломка, а не разовый
//! сбой.
//!
//! Файлы правят руками, и «Блокнот» сохраняет UTF-8 с меткой BOM. Без её
//! снятия `serde_json` считает испорченным весь документ, хотя он цел.

use std::fs;
use std::path::{Path, PathBuf};

/// Читает текстовый файл состояния.
///
/// `Ok(None)` — файла ещё нет: это первый запуск, а не поломка. Остальные
/// отказы возвращаются текстом с путём: без него причину не найти.
pub fn read(path: &Path) -> Result<Option<String>, String> {
    match fs::read_to_string(path) {
        Ok(raw) => Ok(Some(raw)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("Не удалось прочитать '{}': {error}", path.display())),
    }
}

/// Снимает метку BOM, если её поставил редактор.
pub fn strip_bom(raw: &str) -> &str {
    raw.strip_prefix('\u{feff}').unwrap_or(raw)
}

/// Пишет файл через `*.tmp`: после переименования на диске всегда целый файл.
///
/// Переименование в пределах одной папки атомарно, поэтому читатель видит
/// либо прежнее содержимое, либо новое, но никогда — половину.
pub fn write_atomic(path: &Path, contents: &str) -> Result<(), String> {
    let temporary = temporary_path(path);
    fs::write(&temporary, contents)
        .map_err(|error| format!("Не удалось записать '{}': {error}", temporary.display()))?;

    if let Err(error) = fs::rename(&temporary, path) {
        // Временный файл при отказе удаляем: мусор в папке программы
        // остаётся навсегда и путает при разборе.
        let _ = fs::remove_file(&temporary);
        return Err(format!(
            "Не удалось переименовать '{}' в '{}': {error}",
            temporary.display(),
            path.display()
        ));
    }
    Ok(())
}

/// Имя временного файла рядом с целевым: переименование не должно пересекать
/// границу диска или сетевой шары.
fn temporary_path(path: &Path) -> PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push(".tmp");
    PathBuf::from(name)
}

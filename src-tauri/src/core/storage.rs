//! Портативный корень приложения (ADR 0005).
//!
//! Всё состояние — настройки, лог — лежит рядом с исполняемым файлом.
//! Отката в системные каталоги нет: если писать некуда, приложение
//! не может работать правильно, и это нужно показать сразу, а не выяснять
//! при разборе поломки.

use std::fs;
use std::path::{Path, PathBuf};

/// Имя пробного файла проверки записи. Пользователь его не видит:
/// файл создаётся и удаляется в одной проверке.
const PROBE_FILE: &str = ".write-probe";

/// Портативный корень и правила раскладки файлов внутри него.
pub struct Storage {
    root: PathBuf,
}

impl Storage {
    /// Определяет корень — папку исполняемого файла.
    ///
    /// Это единственный способ узнать, где живёт программа: рабочий каталог
    /// зависит от того, откуда её запустили, и для переносимости не годится.
    pub fn detect() -> Result<Self, String> {
        let exe = std::env::current_exe()
            .map_err(|error| format!("Не удалось определить путь к программе: {error}"))?;
        let root = exe.parent().ok_or_else(|| {
            format!("У пути к программе нет папки: {}", exe.display())
        })?;
        Ok(Self::at(root))
    }

    /// Корень, заданный явно. Нужен проверкам: в тестах нет исполняемого файла.
    pub fn at(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    /// Папка программы.
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Папка логов: `logs` рядом с программой.
    pub fn logs_dir(&self) -> PathBuf {
        self.root.join("logs")
    }

    /// Файл настроек: `settings.json` рядом с программой.
    pub fn settings_path(&self) -> PathBuf {
        self.root.join("settings.json")
    }

    /// Проверка записи **делом**: создать `logs`, записать и удалить файл.
    ///
    /// Атрибут «только чтение» не описывает всех причин отказа (права ACL,
    /// сетевой диск, политика). Единственный надёжный ответ — попробовать
    /// записать. Заодно создаётся папка логов: без неё приложение всё равно
    /// не сможет работать.
    pub fn probe(&self) -> Result<(), String> {
        let logs = self.logs_dir();
        fs::create_dir_all(&logs).map_err(|error| self.reason(&logs, &error))?;

        let probe = logs.join(PROBE_FILE);
        fs::write(&probe, b"probe").map_err(|error| self.reason(&probe, &error))?;
        fs::remove_file(&probe).map_err(|error| self.reason(&probe, &error))?;
        Ok(())
    }

    /// Человеческое объяснение отказа: путь важнее кода ошибки.
    fn reason(&self, path: &Path, error: &std::io::Error) -> String {
        format!("Не удалось записать '{}': {error}", path.display())
    }
}

#[cfg(test)]
mod tests {
    //! Проверки касаются только самой пробы: она должна ловить отказ,
    //! а не полагаться на атрибуты файловой системы.

    use super::*;

    /// Уникальный временный корень: тесты идут параллельно, имя не должно
    /// совпадать.
    fn temp_root(tag: &str) -> PathBuf {
        std::env::temp_dir().join(format!("toolbox-{tag}-{}", std::process::id()))
    }

    #[test]
    fn probe_creates_logs_and_removes_probe_file() {
        let root = temp_root("storage-ok");
        let storage = Storage::at(&root);

        storage.probe().expect("проба должна пройти");

        assert!(storage.logs_dir().is_dir(), "папка логов должна появиться");
        assert!(
            !storage.logs_dir().join(PROBE_FILE).exists(),
            "пробный файл не должен оставаться"
        );

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn probe_reports_unwritable_folder() {
        // Путь занят файлом, поэтому папку `logs` создать нельзя.
        let root = temp_root("storage-bad");
        fs::create_dir_all(&root).expect("временная папка");
        fs::write(root.join("logs"), "не папка").expect("мешающий файл");

        let storage = Storage::at(&root);
        let error = storage.probe().expect_err("проба обязана провалиться");

        assert!(
            error.contains("logs"),
            "в объяснении должен быть путь: {error}"
        );

        let _ = fs::remove_dir_all(&root);
    }
}

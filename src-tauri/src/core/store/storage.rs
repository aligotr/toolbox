//! Портативный корень приложения и раскладка файлов (ADR 0005, ADR 0010,
//! ADR 0050).
//!
//! Всё состояние — настройки, рабочее пространство, лог, профили — лежит
//! рядом с исполняемым файлом. Отката в системные каталоги нет: если писать
//! некуда, приложение не может работать правильно, и это нужно показать
//! сразу, а не выяснять при разборе поломки.
//!
//! Граница между `local/` и `profiles/` проходит по владельцу и частоте:
//! машинное и частое — в `local/`, пользовательское и переносимое —
//! в `profiles/`. Поэтому пути собраны здесь, а не в вызывающем коде:
//! ошибка в одном месте сломала бы синхронизацию незаметно.

use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use crate::core::infra::error::{fail, AppError, AppResult};

/// Имя пробного файла проверки записи. Пользователь его не видит:
/// файл создаётся и удаляется в одной проверке.
const PROBE_FILE: &str = ".write-probe";

/// Папка машинного состояния: не синхронизируется между машинами.
const LOCAL_DIR: &str = "local";

/// Папка профилей: синхронизируется, принадлежит пользователю.
pub(crate) const PROFILES_DIR: &str = "profiles";

/// Папка логов внутри `local/`.
const LOGS_DIR: &str = "logs";

/// Папка словарей интерфейса внутри `local/` (ADR 0039).
pub(crate) const LANGUAGES_DIR: &str = "languages";

/// Папка рабочих пространств профилей внутри `local/` (ADR 0050).
///
/// Вкладки — частое машинное состояние: файл на профиль лежит вне
/// синхронизируемых `profiles/`, чтобы раскладка не создавала конфликтов.
const WORKSPACES_DIR: &str = "workspaces";

/// Папка пресетов настроек внутри профиля: `presets/<tool>/`.
///
/// Пресет — пользовательская настройка, а не данные инструмента: он лежит
/// в профиле отдельно и не попадает под очистку `data/<tool>/`.
pub(crate) const PRESETS_DIR: &str = "presets";

/// Папка данных инструментов внутри профиля: `data/<tool>/`.
///
/// Раскладка общая для всех инструментов (ADR 0010): инструмент сам решает,
/// какие файлы положить в свою папку, а ядро знает только её место.
pub(crate) const DATA_DIR: &str = "data";

/// Папка корзины внутри `local/`: удалённое живёт здесь 14 дней,
/// затем удаляется автоматически.
const TRASH_DIR: &str = "trash";

/// Активный профиль до появления выбора профилей (тикет 09).
///
/// Идентификатор совпадает с профилем по умолчанию в ADR 0010, чтобы
/// проверка записи уже смотрела в настоящую папку, а не в выдуманную.
pub const DEFAULT_PROFILE: &str = "work";

/// Портативный корень и правила раскладки файлов внутри него.
pub struct Storage {
    root: PathBuf,
    /// Идентификатор активного профиля; папка — `profiles/<id>/`.
    profile: String,
}

impl Storage {
    /// Определяет корень — папку исполняемого файла.
    ///
    /// Это единственный способ узнать, где живёт программа: рабочий каталог
    /// зависит от того, откуда её запустили, и для переносимости не годится.
    pub fn detect() -> AppResult<Self> {
        let exe = std::env::current_exe().map_err(|error| {
            AppError::new(
                "errors.storage.exe",
                format!("Не удалось определить путь к программе: {error}"),
            )
            .with("reason", error)
        })?;
        let root = exe.parent().ok_or_else(|| {
            AppError::new(
                "errors.storage.noFolder",
                format!("У пути к программе нет папки: {}", exe.display()),
            )
            .with("path", exe.display())
        })?;
        Ok(Self::at(root))
    }

    /// Корень, заданный явно. Нужен проверкам: в тестах нет исполняемого файла.
    pub fn at(root: impl Into<PathBuf>) -> Self {
        Self {
            root: root.into(),
            profile: DEFAULT_PROFILE.to_owned(),
        }
    }

    /// Задаёт активный профиль. Идентификатор приходит из настроек и уже
    /// проверен: сюда не должен попасть путь с разделителями.
    pub fn with_profile(mut self, profile: impl Into<String>) -> Self {
        self.profile = profile.into();
        self
    }

    /// Папка программы.
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Машинное состояние: настройки, рабочее пространство, корзина, лог.
    pub fn local_dir(&self) -> PathBuf {
        self.root.join(LOCAL_DIR)
    }

    /// Файл настроек: `local/settings.json`.
    pub fn settings_path(&self) -> PathBuf {
        self.local_dir().join("settings.json")
    }

    /// Папка рабочих пространств профилей: `local/workspaces/`.
    pub fn workspaces_dir(&self) -> PathBuf {
        self.local_dir().join(WORKSPACES_DIR)
    }

    /// Файл рабочего пространства активного профиля (ADR 0050).
    pub fn workspace_path(&self) -> PathBuf {
        self.workspace_path_for(&self.profile)
    }

    /// Файл рабочего пространства названного профиля.
    ///
    /// Идентификатор приходит из настроек или из имени папки и уже проверен;
    /// путь с разделителями сюда попасть не должен.
    pub fn workspace_path_for(&self, profile: &str) -> PathBuf {
        self.workspaces_dir().join(format!("{profile}.json"))
    }

    /// Папка логов: `local/logs/`.
    pub fn logs_dir(&self) -> PathBuf {
        self.local_dir().join(LOGS_DIR)
    }

    /// Папка словарей интерфейса: `local/languages/` (ADR 0039).
    ///
    /// Машинное состояние: выбранный язык не переезжает вместе с профилем.
    /// Внутри - пользовательские файлы словарей; приложение их не
    /// перезаписывает.
    pub fn languages_dir(&self) -> PathBuf {
        self.local_dir().join(LANGUAGES_DIR)
    }

    /// Корзина внешних словарей: `local/trash/languages/`.
    ///
    /// Возврат к встроенному языку не стирает файл пользователя: он лежит
    /// в корзине до автоочистки.
    pub fn languages_trash_dir(&self) -> PathBuf {
        self.trash_dir().join(LANGUAGES_DIR)
    }

    /// Папка корзины: `local/trash/`.
    ///
    /// Лежит в `local/`, а не в синхронизируемых `profiles/`: удаление —
    /// решение этой машины, и чужая копия не должна получать чужую корзину.
    /// Корзина внутренняя: входа в интерфейсе нет, записи старше 14 дней
    /// удаляются автоматически.
    pub fn trash_dir(&self) -> PathBuf {
        self.local_dir().join(TRASH_DIR)
    }

    /// Корзина профилей: `local/trash/profiles/`.
    ///
    /// Верхний уровень повторяет единицу удаления: здесь лежат только
    /// профили, удалённые целиком.
    pub fn profiles_trash_dir(&self) -> PathBuf {
        self.trash_dir().join(PROFILES_DIR)
    }

    /// Папка пресетов настроек активного профиля: `profiles/<id>/presets/`.
    ///
    /// Внутри — папка инструмента: `presets/<tool>/<presetId>.json`. Пресет
    /// принадлежит профилю, как и данные: коллега должен получить те же
    /// сохранённые настройки инструментов.
    pub fn presets_dir(&self) -> PathBuf {
        self.active_profile_dir().join(PRESETS_DIR)
    }

    /// Корзина пресетов: `local/trash/presets/`.
    ///
    /// Внутри — профиль, затем инструмент: `presets/<profile>/<tool>/`.
    /// Профиль в пути сохраняет происхождение пресета, а единица удаления
    /// остаётся отдельной от профилей.
    pub fn presets_trash_dir(&self) -> PathBuf {
        self.trash_dir().join(PRESETS_DIR)
    }

    /// Папка данных инструментов активного профиля: `profiles/<id>/data/`.
    ///
    /// Данные принадлежат профилю: список DNS, привезённый с другой машины,
    /// должен открываться в том же профиле.
    pub fn data_dir(&self) -> PathBuf {
        self.active_profile_dir().join(DATA_DIR)
    }

    /// Папка профилей: `profiles/`.
    pub fn profiles_dir(&self) -> PathBuf {
        self.root.join(PROFILES_DIR)
    }

    /// Папка активного профиля: `profiles/<id>/`.
    pub fn active_profile_dir(&self) -> PathBuf {
        self.profiles_dir().join(&self.profile)
    }

    /// Создаёт раскладку и проверяет запись **делом**.
    ///
    /// Атрибут «только чтение» не описывает всех причин отказа (права ACL,
    /// сетевой диск, политика). Единственный надёжный ответ — попробовать
    /// записать. Проверяются три места, потому что каждое может отказать
    /// отдельно: корень, `local/` и папка активного профиля. Лог и профили
    /// создаются заодно: без них приложение всё равно не сможет работать.
    pub fn probe(&self) -> AppResult<()> {
        let local = self.local_dir();
        let logs = self.logs_dir();
        let languages = self.languages_dir();
        let profiles = self.profiles_dir();
        let profile = self.active_profile_dir();
        let workspaces = self.workspaces_dir();

        for dir in [&local, &logs, &languages, &profiles, &profile, &workspaces] {
            fs::create_dir_all(dir).map_err(|error| self.create_error(dir, &error))?;
        }

        for dir in [&self.root, &local, &profile] {
            self.probe_dir(dir)?;
        }
        Ok(())
    }

    /// Проверяет запись в папку названного профиля.
    ///
    /// Папка не создаётся: переключение на исчезнувший профиль должно
    /// отказать, а не восстановить пустую папку без данных.
    pub fn probe_profile(&self, profile: &str) -> AppResult<()> {
        let dir = self.profiles_dir().join(profile);
        if !dir.is_dir() {
            return fail!(
                "errors.storage.missingFolder",
                format!("Папка '{}' не найдена", dir.display()),
                path = dir.display(),
            );
        }
        self.write_probe(&dir)
    }

    /// Создаёт папку, если её нет, и проверяет запись в неё.
    fn probe_dir(&self, dir: &Path) -> AppResult<()> {
        fs::create_dir_all(dir).map_err(|error| self.create_error(dir, &error))?;
        self.write_probe(dir)
    }

    /// Пишет и убирает пробный файл в существующей папке.
    fn write_probe(&self, dir: &Path) -> AppResult<()> {
        let probe = dir.join(PROBE_FILE);
        fs::write(&probe, b"probe").map_err(|error| self.write_error(&probe, &error))?;
        fs::remove_file(&probe).map_err(|error| self.write_error(&probe, &error))?;
        Ok(())
    }

    /// Отказ создать папку раскладки: причина словами пользователя.
    ///
    /// Код ОС («os error 183») ничего не объясняет: на месте папки чаще всего
    /// лежит файл, а на запись не хватает прав. Для этих случаев есть свои
    /// формулировки; неизвестная причина остаётся технической и попадает
    /// в запасной текст.
    fn create_error(&self, path: &Path, error: &std::io::Error) -> AppError {
        match error.kind() {
            ErrorKind::AlreadyExists => AppError::new(
                "errors.storage.pathIsFile",
                format!(
                    "По пути '{}' уже лежит файл, а программа ожидает папку",
                    path.display()
                ),
            )
            .with("path", path.display()),
            ErrorKind::PermissionDenied => AppError::new(
                "errors.storage.denied",
                format!("Нет прав на запись в '{}'", path.display()),
            )
            .with("path", path.display()),
            _ => AppError::new(
                "errors.storage.create",
                format!("Не удалось создать папку '{}': {error}", path.display()),
            )
            .with("path", path.display())
            .with("reason", error),
        }
    }

    /// Отказ записать или удалить пробный файл.
    fn write_error(&self, path: &Path, error: &std::io::Error) -> AppError {
        match error.kind() {
            ErrorKind::PermissionDenied => AppError::new(
                "errors.storage.denied",
                format!("Нет прав на запись в '{}'", path.display()),
            )
            .with("path", path.display()),
            _ => AppError::new(
                "errors.storage.write",
                format!("Не удалось записать '{}': {error}", path.display()),
            )
            .with("path", path.display())
            .with("reason", error),
        }
    }
}

#[cfg(test)]
mod tests {
    //! Проверки касаются раскладки и пробы: промах в пути ломает синхронизацию
    //! незаметно, а проба должна ловить отказ в любом из трёх мест.

    use super::*;

    /// Уникальный временный корень: тесты идут параллельно, имя не должно
    /// совпадать.
    fn temp_root(tag: &str) -> PathBuf {
        std::env::temp_dir().join(format!("toolbox-{tag}-{}", std::process::id()))
    }

    #[test]
    fn layout_paths_live_under_expected_folders() {
        let root = temp_root("storage-layout");
        let storage = Storage::at(&root);

        assert_eq!(storage.local_dir(), root.join("local"));
        assert_eq!(
            storage.settings_path(),
            root.join("local").join("settings.json")
        );
        assert_eq!(
            storage.workspace_path(),
            root.join("local")
                .join("workspaces")
                .join(format!("{DEFAULT_PROFILE}.json"))
        );
        assert_eq!(
            storage.workspace_path_for("home"),
            root.join("local").join("workspaces").join("home.json")
        );
        assert_eq!(
            storage.workspaces_dir(),
            root.join("local").join("workspaces")
        );
        assert_eq!(storage.logs_dir(), root.join("local").join("logs"));
        assert_eq!(
            storage.languages_dir(),
            root.join("local").join("languages")
        );
        assert_eq!(storage.trash_dir(), root.join("local").join("trash"));
        assert_eq!(storage.profiles_dir(), root.join("profiles"));
        assert_eq!(
            storage.active_profile_dir(),
            root.join("profiles").join(DEFAULT_PROFILE)
        );
        assert_eq!(
            storage.presets_dir(),
            root.join("profiles").join(DEFAULT_PROFILE).join("presets")
        );
        assert_eq!(
            storage.presets_trash_dir(),
            root.join("local").join("trash").join("presets")
        );
        assert_eq!(
            storage.profiles_trash_dir(),
            root.join("local").join("trash").join("profiles")
        );
        assert_eq!(
            storage.languages_trash_dir(),
            root.join("local").join("trash").join("languages")
        );
        assert_eq!(
            storage.data_dir(),
            root.join("profiles").join(DEFAULT_PROFILE).join("data")
        );
    }

    #[test]
    fn probe_creates_layout_and_removes_probe_files() {
        let root = temp_root("storage-ok");
        let storage = Storage::at(&root);

        storage.probe().expect("проба должна пройти");

        for dir in [
            storage.local_dir(),
            storage.logs_dir(),
            storage.languages_dir(),
            storage.profiles_dir(),
            storage.active_profile_dir(),
            storage.workspaces_dir(),
        ] {
            assert!(dir.is_dir(), "папка должна появиться: {}", dir.display());
        }

        for dir in [
            root.clone(),
            storage.local_dir(),
            storage.active_profile_dir(),
        ] {
            assert!(
                !dir.join(PROBE_FILE).exists(),
                "пробный файл не должен оставаться: {}",
                dir.display()
            );
        }

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn probe_reports_unwritable_root() {
        // Корень занят файлом, поэтому раскладку внутри него не создать.
        let root = temp_root("storage-bad-root");
        let _ = fs::remove_dir_all(&root);
        fs::write(&root, "не папка").expect("мешающий файл");

        let storage = Storage::at(&root);
        let error = storage.probe().expect_err("проба обязана провалиться");

        assert!(
            error.to_string().contains("storage-bad-root"),
            "в объяснении должен быть путь: {error}"
        );

        let _ = fs::remove_file(&root);
    }

    #[test]
    fn probe_reports_unwritable_local_folder() {
        // `local` занят файлом, поэтому папку машинного состояния не создать.
        let root = temp_root("storage-bad-local");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("временная папка");
        fs::write(root.join("local"), "не папка").expect("мешающий файл");

        let storage = Storage::at(&root);
        let error = storage.probe().expect_err("проба обязана провалиться");

        assert!(
            error.to_string().contains("local"),
            "в объяснении должен быть путь: {error}"
        );
        assert!(
            error.to_string().contains("файл"),
            "причина названа словами пользователя: {error}"
        );
        assert!(
            !error.to_string().contains("os error"),
            "код ОС не показывается пользователю: {error}"
        );

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn probe_profile_creates_and_removes_probe_file() {
        let root = temp_root("storage-profile-probe");
        let storage = Storage::at(&root).with_profile("work");
        let home = storage.profiles_dir().join("home");
        fs::create_dir_all(&home).expect("папка профиля");

        storage.probe_profile("home").expect("проба профиля");

        assert!(!home.join(PROBE_FILE).exists(), "пробный файл убран");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn probe_profile_reports_missing_folder() {
        let root = temp_root("storage-profile-bad");
        let storage = Storage::at(&root).with_profile("work");

        let error = storage
            .probe_profile("home")
            .expect_err("исчезнувший профиль не восстанавливается");

        assert_eq!(error.code, "errors.storage.missingFolder");
        assert!(
            !storage.profiles_dir().join("home").exists(),
            "пустая папка не создаётся"
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn create_error_explains_permission_denied() {
        let storage = Storage::at(temp_root("storage-denied"));
        let path = storage.root().join("local");
        let denied = std::io::Error::from(ErrorKind::PermissionDenied);

        let error = storage.create_error(&path, &denied);

        assert_eq!(error.code, "errors.storage.denied");
        assert!(
            !error.to_string().contains("os error"),
            "код ОС не показывается пользователю: {error}"
        );
    }

    #[test]
    fn probe_reports_unwritable_profile_folder() {
        // Папка профиля занята файлом: корень и `local/` при этом исправны.
        let root = temp_root("storage-bad-profile");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("profiles")).expect("временная папка");
        fs::write(root.join("profiles").join(DEFAULT_PROFILE), "не папка").expect("мешающий файл");

        let storage = Storage::at(&root);
        let error = storage.probe().expect_err("проба обязана провалиться");

        assert!(
            error.to_string().contains(DEFAULT_PROFILE),
            "в объяснении должен быть путь профиля: {error}"
        );

        let _ = fs::remove_dir_all(&root);
    }
}

//! Файловый лог (ADR 0004).
//!
//! Лог отвечает ровно на один вопрос: «почему приложение или его функция
//! не сработали». Работа модулей (DNS-запросы, ping) сюда не попадает —
//! для неё есть журнал интерфейса.
//!
//! Своя реализация `log::Log` вместо плагина Tauri: плагин пишет в каталог
//! данных приложения и фиксирует уровень при старте. Оба свойства противоречат
//! переносимости и смене уровня без перезапуска.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::{Arc, Mutex};

use chrono::{Local, NaiveDate};
use serde::{Deserialize, Serialize};

/// Сколько дней храним файлы лога.
pub const KEEP_DAYS: i64 = 14;

/// Префикс имени файла: `toolbox-2026-11-12.log`.
const FILE_PREFIX: &str = "toolbox-";

/// Порог логирования. Уровня `trace` нет: без спанов он даёт шум.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Error,
    Warn,
    Info,
    Debug,
}

impl Default for LogLevel {
    fn default() -> Self {
        // Штатный режим: отказы и предупреждения видны, отладочных строк нет.
        Self::Info
    }
}

impl LogLevel {
    /// Разбирает значение из настроек или команды. Регистр не важен.
    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "error" => Some(Self::Error),
            "warn" => Some(Self::Warn),
            "info" => Some(Self::Info),
            "debug" => Some(Self::Debug),
            _ => None,
        }
    }

    /// Порядковый номер для `AtomicU8` и сравнений порога.
    fn rank(self) -> u8 {
        match self {
            Self::Error => 1,
            Self::Warn => 2,
            Self::Info => 3,
            Self::Debug => 4,
        }
    }

    /// Тот же порог в терминах `log`: по нему отсекаются записи.
    fn filter(self) -> log::LevelFilter {
        match self {
            Self::Error => log::LevelFilter::Error,
            Self::Warn => log::LevelFilter::Warn,
            Self::Info => log::LevelFilter::Info,
            Self::Debug => log::LevelFilter::Debug,
        }
    }

    fn from_rank(rank: u8) -> Self {
        match rank {
            1 => Self::Error,
            2 => Self::Warn,
            4 => Self::Debug,
            // Неизвестное значение атомарного поля — не повод прятать отказы.
            _ => Self::Info,
        }
    }
}

impl std::fmt::Display for LogLevel {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let text = match self {
            Self::Error => "error",
            Self::Warn => "warn",
            Self::Info => "info",
            Self::Debug => "debug",
        };
        formatter.write_str(text)
    }
}

/// Открытый файл текущих суток.
struct OpenFile {
    /// Дата в имени файла: при смене суток файл переоткрывается.
    date: String,
    file: File,
}

/// Файловый логгер. Держит порог в атомарном поле: уровень меняется на лету.
pub struct Logger {
    dir: PathBuf,
    level: AtomicU8,
    current: Mutex<Option<OpenFile>>,
}

impl Logger {
    /// Путь к файлу текущих суток. Показывается интерфейсу, чтобы пользователь
    /// знал, куда смотреть после поломки.
    pub fn path(&self) -> PathBuf {
        self.dir.join(file_name(&today()))
    }

    /// Меняет порог без перезапуска.
    pub fn set_level(&self, level: LogLevel) {
        self.level.store(level.rank(), Ordering::Relaxed);
    }

    /// Текущий порог.
    pub fn level(&self) -> LogLevel {
        LogLevel::from_rank(self.level.load(Ordering::Relaxed))
    }

    /// Сбрасывает файл на диск. Нужен панике: в релизе стоит `panic = "abort"`,
    /// и это единственный шанс сохранить последние строки.
    pub fn flush(&self) {
        if let Some(open) = self.current.lock().expect("log file lock").as_mut() {
            let _ = open.file.flush();
        }
    }

    /// Пишет одну строку. Ошибка записи не логируется: писать её некуда,
    /// а stderr у приложения нет по решению (ADR 0004).
    fn write_line(&self, level: &str, target: &str, message: &str) {
        let today = today();
        let mut guard = self.current.lock().expect("log file lock");

        let reopen = guard
            .as_ref()
            .map(|open| open.date != today)
            .unwrap_or(true);

        if reopen {
            let path = self.dir.join(file_name(&today));
            let file = match OpenOptions::new().create(true).append(true).open(&path) {
                Ok(file) => file,
                // Папку проверяли при старте, но диск мог отвалиться позже.
                Err(_) => return,
            };
            *guard = Some(OpenFile {
                date: today,
                file,
            });
        }

        let Some(open) = guard.as_mut() else {
            return;
        };
        let now = Local::now().format("%H:%M:%S%.3f");
        // Сбрасываем каждую строку: строк за запуск единицы, а паника
        // с `abort` не оставляет времени на отложенную запись.
        let _ = writeln!(open.file, "{now} {level:<5} {target}: {message}");
        let _ = open.file.flush();
    }
}

/// Включает файловый лог в папке `dir` с порогом `level`.
///
/// Папку создаёт хранилище; здесь она проверяется ещё раз, потому что
/// логгер обязан работать без оглядки на порядок вызовов.
pub fn init(dir: PathBuf, level: LogLevel) -> Result<Arc<Logger>, String> {
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Не удалось создать папку логов '{}': {error}", dir.display()))?;
    prune(&dir);

    let logger = Arc::new(Logger {
        dir,
        level: AtomicU8::new(level.rank()),
        current: Mutex::new(None),
    });

    log::set_boxed_logger(Box::new(Global {
        logger: logger.clone(),
    }))
    .map_err(|error| format!("Логгер уже установлен: {error}"))?;
    // Порог проверяет наш `enabled`: `log` не должен отсекать строки раньше,
    // иначе смена уровня на лету не сработает.
    log::set_max_level(log::LevelFilter::Debug);

    Ok(logger)
}

/// Ставит обработчик паники: пишет причину и backtrace, затем сбрасывает файл.
///
/// Стандартный обработчик не вызывается: он пишет в stderr, а второго канала
/// записи у приложения нет (ADR 0004).
pub fn install_panic_hook(logger: Arc<Logger>) {
    std::panic::set_hook(Box::new(move |info| {
        let backtrace = std::backtrace::Backtrace::force_capture();
        log::error!("паника процесса: {info}\n{backtrace}");
        logger.flush();
    }));
}

/// Обёртка для `log`: глобальный логгер требует `'static`, а порог живёт
/// в общем `Arc` и меняется на лету.
struct Global {
    logger: Arc<Logger>,
}

impl log::Log for Global {
    fn enabled(&self, metadata: &log::Metadata) -> bool {
        metadata.level().to_level_filter() <= self.logger.level().filter()
    }

    fn log(&self, record: &log::Record) {
        if !self.enabled(record.metadata()) {
            return;
        }
        self.logger.write_line(
            &record.level().to_string(),
            record.target(),
            &record.args().to_string(),
        );
    }

    fn flush(&self) {
        self.logger.flush();
    }
}

/// Сегодняшняя дата в локальном времени: имя файла должно совпадать с сутками
/// пользователя, а не с UTC.
fn today() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

fn file_name(date: &str) -> String {
    format!("{FILE_PREFIX}{date}.log")
}

/// Удаляет файлы лога старше [`KEEP_DAYS`] дней.
///
/// Чужие файлы в папке не трогаются: разбор имени строгий.
fn prune(dir: &Path) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let today = Local::now().date_naive();

    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(date) = parse_date(&name.to_string_lossy()) else {
            continue;
        };
        if (today - date).num_days() > KEEP_DAYS {
            let _ = fs::remove_file(entry.path());
        }
    }
}

/// Достаёт дату из имени `toolbox-ГГГГ-ММ-ДД.log`.
fn parse_date(name: &str) -> Option<NaiveDate> {
    let rest = name.strip_prefix(FILE_PREFIX)?;
    let date = rest.strip_suffix(".log")?;
    NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()
}

#[cfg(test)]
mod tests {
    //! Проверки затрагивают разбор уровня и ротацию: обе части легко
    //! сломать незаметно.

    use super::*;

    #[test]
    fn level_parsing_is_case_insensitive() {
        assert_eq!(LogLevel::parse("DEBUG"), Some(LogLevel::Debug));
        assert_eq!(LogLevel::parse(" info "), Some(LogLevel::Info));
        assert_eq!(LogLevel::parse("trace"), None, "уровня trace нет");
        assert_eq!(LogLevel::parse(""), None);
    }

    #[test]
    fn default_level_is_info() {
        assert_eq!(LogLevel::default(), LogLevel::Info);
    }

    #[test]
    fn only_own_files_are_recognised_for_rotation() {
        assert!(parse_date("toolbox-2026-11-12.log").is_some());
        assert!(parse_date("toolbox-2026-11-12.log.old").is_none());
        assert!(parse_date("чужой-2026-11-12.log").is_none());
        assert!(parse_date("toolbox-не-дата.log").is_none());
    }
}

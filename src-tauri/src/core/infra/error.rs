//! Ошибка ядра: код для перевода, данные и русский текст (ADR 0039).
//!
//! Интерфейс показывает `code` с подстановками `params`; русский `fallback`
//! нужен файловому логу, тестам и откату, когда перевода кода ещё нет.
//! Код — публичный контракт вида `errors.<область>.<случай>`: формулировку
//! менять можно, код — нет.

use std::collections::BTreeMap;
use std::fmt;

use serde::Serialize;

/// Отказ, который интерфейс переводит по коду.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AppError {
    /// Ключ словаря: `errors.<область>.<случай>`.
    pub code: String,
    /// Подстановки сообщения: имена и значения-данные.
    pub params: BTreeMap<String, String>,
    /// Русский текст: лог, тесты и откат при неизвестном коде.
    pub fallback: String,
}

impl AppError {
    /// Отказ с кодом и русским текстом.
    pub fn new(code: impl Into<String>, fallback: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            params: BTreeMap::new(),
            fallback: fallback.into(),
        }
    }

    /// Добавляет подстановку: значение остаётся данными, а не готовой фразой.
    pub fn with(mut self, name: &str, value: impl ToString) -> Self {
        self.params.insert(name.to_owned(), value.to_string());
        self
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.fallback)
    }
}

impl std::error::Error for AppError {}

impl From<String> for AppError {
    /// Отказ без кода: подробность хранилища становится причиной.
    ///
    /// Так выглядят ошибки нижних слоёв, у которых нет своего словаря:
    /// вызывающий при желании заменяет код на более точный.
    fn from(reason: String) -> Self {
        Self::new("errors.core.unexpected", reason.clone()).with("reason", reason)
    }
}

impl From<&str> for AppError {
    fn from(reason: &str) -> Self {
        Self::from(reason.to_owned())
    }
}

/// Результат операции ядра.
pub type AppResult<T> = Result<T, AppError>;

/// Отказ из кода, русского текста и подстановок.
///
/// `fail!("errors.profiles.read", format!("..."), path = path.display())`
/// возвращает `Err(AppError)`: текст и параметры задаются в одном месте.
macro_rules! fail {
    ($code:expr, $fallback:expr $(, $name:ident = $value:expr)* $(,)?) => {
        Err($crate::core::infra::error::AppError::new($code, $fallback)
            $(.with(stringify!($name), $value))*)
    };
}

pub(crate) use fail;

#[cfg(test)]
mod tests {
    //! Проверяется контракт с интерфейсом: поля, откат и подстановки.

    use super::*;

    #[test]
    fn error_carries_code_params_and_fallback() {
        let error = AppError::new("errors.profiles.read", "Не удалось прочитать")
            .with("path", "/tmp/profiles");

        assert_eq!(error.code, "errors.profiles.read");
        assert_eq!(error.params["path"], "/tmp/profiles");
        assert_eq!(error.fallback, "Не удалось прочитать");
    }

    #[test]
    fn display_is_russian_fallback() {
        let error = AppError::new("errors.profiles.read", "Не удалось прочитать");

        assert_eq!(error.to_string(), "Не удалось прочитать");
        assert!(error.to_string().contains("прочитать"));
    }

    #[test]
    fn bridged_string_is_a_reason_not_a_key() {
        let error = AppError::from("нет доступа".to_owned());

        assert_eq!(error.code, "errors.core.unexpected");
        assert_eq!(error.params["reason"], "нет доступа");
    }

    #[test]
    fn fail_macro_collects_params() {
        let value: AppResult<()> = fail!(
            "errors.profiles.read",
            "Не удалось прочитать '{path}'",
            path = "/tmp",
        );

        let error = value.expect_err("отказ");
        assert_eq!(error.params["path"], "/tmp");
    }
}

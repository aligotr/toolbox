//! Ядро платформы: зоны и одно правило зависимостей.
//!
//! Зоны заданы папками, а не комментарием: [`infra`] — механизмы без знания
//! предмета, [`store`] — доступ к файлам и профилю, [`services`] — домены
//! с их правилами (ADR 0035).
//!
//! Над зонами стоит адаптер [`commands`] — команды Tauri (ADR 0048).
//! Он вправе звать любой сервис; обратной стрелки нет: сервис не знает,
//! что его зовут из интерфейса.
//!
//! Зависимости идут только вниз: `infra ← store ← services ← commands`.
//! Обратных стрелок нет, и это проверяет тест [`zone_tests`]: иначе зоны
//! снова станут договором на словах.
//!
//! Идея заимствована из образца (CQRS + loosely coupled):
//! подсистемы не вызывают друг друга напрямую, а обмениваются
//! **командами** (Command) и **событиями** (Event) через шину.

pub mod commands;
pub mod infra;
pub mod runtime;
pub mod services;
pub mod store;

#[cfg(test)]
mod zone_tests {
    //! Стражи границ зон.
    //!
    //! Проверка читает исходники, а не типы: имена модулей и пути импортов
    //! видны только в тексте, и другого способа запретить стрелку вверх
    //! у Rust нет. Тест дешёвый и падает на первой же попытке инфраструктуры
    //! узнать про домен.

    use std::fs;
    use std::path::{Path, PathBuf};

    /// Исходники зоны: все `.rs`-файлы в её папке.
    fn sources(zone: &str) -> Vec<(PathBuf, String)> {
        let root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("src")
            .join("core")
            .join(zone);
        let mut files = Vec::new();
        collect(&root, &mut files);

        files
            .into_iter()
            .map(|path| {
                let text = fs::read_to_string(&path).expect("исходник зоны");
                (path, text)
            })
            .collect()
    }

    fn collect(dir: &Path, files: &mut Vec<PathBuf>) {
        let Ok(entries) = fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                collect(&path, files);
            } else if path.extension().is_some_and(|extension| extension == "rs") {
                files.push(path);
            }
        }
    }

    /// Строки кода без комментариев и пробелов: документация вправе называть
    /// соседнюю зону, а запрет касается только настоящих ссылок в коде.
    ///
    /// Пробелы убираются, чтобы `use crate::core::{store::files}` не проскочил
    /// мимо запрета на `crate::core::store`.
    fn code_only(text: &str) -> String {
        text.lines()
            .filter(|line| {
                let trimmed = line.trim_start();
                !(trimmed.starts_with("//") || trimmed.starts_with("/*"))
            })
            .collect::<Vec<_>>()
            .join(" ")
            .split_whitespace()
            .collect()
    }

    /// Инфраструктура не знает ни хранилища, ни доменов.
    #[test]
    fn infra_knows_no_other_zone() {
        for (path, text) in sources("infra") {
            let code = code_only(&text);
            for forbidden in [
                "crate::core::store",
                "crate::core::services",
                "crate::core::commands",
                "crate::core::runtime",
                "crate::core::{store",
                "crate::core::{services",
                "crate::core::{commands",
                "crate::core::{runtime",
                "super::super::store",
                "super::super::services",
                "super::super::commands",
                "super::super::runtime",
            ] {
                assert!(
                    !code.contains(forbidden),
                    "{}: инфраструктура не должна ссылаться на '{forbidden}'",
                    path.display()
                );
            }
        }
    }

    /// Хранилище не решает, что делать: домены ему неизвестны.
    #[test]
    fn store_knows_no_services() {
        for (path, text) in sources("store") {
            let code = code_only(&text);
            for forbidden in [
                "crate::core::services",
                "crate::core::commands",
                "crate::core::runtime",
                "crate::core::{services",
                "crate::core::{commands",
                "crate::core::{runtime",
                "super::super::services",
                "super::super::commands",
                "super::super::runtime",
            ] {
                assert!(
                    !code.contains(forbidden),
                    "{}: хранилище не должно ссылаться на '{forbidden}'",
                    path.display()
                );
            }
        }
    }

    /// Домен не знает, что его зовут из Tauri, и не читает состояние запуска.
    #[test]
    fn services_know_no_commands() {
        for (path, text) in sources("services") {
            let code = code_only(&text);
            for forbidden in [
                "crate::core::commands",
                "crate::core::{commands",
                "super::commands",
                "crate::core::runtime",
                "crate::core::{runtime",
                "super::runtime",
            ] {
                assert!(
                    !code.contains(forbidden),
                    "{}: сервис не должен ссылаться на '{forbidden}'",
                    path.display()
                );
            }
        }
    }
}

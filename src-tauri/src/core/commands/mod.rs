//! Команды Tauri: вход из интерфейса в ядро (ADR 0048).
//!
//! Один файл — одна область. Команда только разбирает аргументы, получает
//! хранилище из [`Runtime`] и зовёт сервис: правила домена остаются
//! в сервисах, побочные эффекты (лог, событие) — на месте вызова.
//!
//! Зависимость односторонняя: `commands → services → store → infra`.
//! Сервис не знает, что его зовут из Tauri; обратную стрелку ловит
//! `core::zone_tests`.
//!
//! [`Runtime`]: crate::core::runtime::Runtime

pub mod bridge;
pub mod info;
pub mod languages;
pub mod lifecycle;
pub mod presets;
pub mod profiles;
pub mod settings;
pub mod window;
pub mod workspace;

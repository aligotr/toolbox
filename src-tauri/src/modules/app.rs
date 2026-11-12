//! Модуль жизненного цикла приложения.
//!
//! Здесь собраны **команды** — императивные операции с немедленным эффектом.
//! Именно такой случай нельзя смоделировать асинхронным событием: завершение
//! приложения должно произойти сразу и ровно один раз, а вызывающая сторона
//! должна узнать об ошибке.

use serde::Deserialize;
use tauri::AppHandle;

use crate::core::bus::MessageBus;
use crate::core::message::{Command, Message};
use crate::core::module::Module;

/// Команда «завершить приложение».
///
/// Нагрузка пустая: команда не принимает параметров.
#[derive(Debug, Deserialize)]
pub struct QuitApp {}

// `TOPIC` объявлен на базовом трейте `Message`, поэтому реализуется отдельно.
impl Message for QuitApp {
    const TOPIC: &'static str = "app:quit";
}

impl Command for QuitApp {}

/// Модуль управления приложением.
pub struct AppModule;

impl Module for AppModule {
    fn id(&self) -> &'static str {
        "app"
    }

    fn register(&self, bus: &MessageBus) {
        bus.subscribe_command::<QuitApp>(|_command, deps| {
            // Зависимость `AppHandle` добавлена в шину на этапе `setup`.
            // Обработчик не создаёт её сам, а получает из контейнера —
            // это и есть инъекция зависимостей.
            let app = deps.require::<AppHandle>();
            log::info!("Команда app.quit: завершение приложения");
            app.exit(0);
        })
        .expect("не удалось зарегистрировать команду app.quit");
    }
}

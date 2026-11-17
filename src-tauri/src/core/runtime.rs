//! Состояние запуска, которое читают команды интерфейса.
//!
//! Создаётся один раз в точке сборки (`lib.rs`), дальше живёт в
//! `tauri::State`. Здесь только данные и доступ к ним: правила домена
//! остаются в сервисах, а команды — в `core::commands` (ADR 0048).
//!
//! Поля закрыты для остального крейта: снаружи состояние меняет только
//! точка сборки.

use std::sync::{Arc, Mutex};

use crate::core::infra::error::{AppError, AppResult};
use crate::core::services::logging::Logger;
use crate::core::services::settings::Settings;
use crate::core::services::window::GeometrySaver;
use crate::core::store::storage::Storage;

/// Почему приложение не может начать работу.
///
/// Заголовок у каждого отказа свой: «не могу писать в папку» и «лог не
/// запустился» требуют разных действий, а общий заголовок заставил бы
/// пользователя выискивать различие в тексте причины.
pub(crate) struct StartupError {
    /// Код заголовка блокирующего экрана.
    pub(crate) title: &'static str,
    /// Что именно не удалось — код, данные и русский запасной текст.
    pub(crate) reason: AppError,
}

/// Состояние, которое читают команды интерфейса после запуска.
pub(crate) struct Runtime {
    /// `Some` — работать нельзя: модули не запущены, нужен блокирующий экран.
    pub(crate) blocked: Option<StartupError>,
    /// Папка программы.
    pub(crate) root: String,
    /// `None`, если лог не запустился.
    pub(crate) logger: Option<Arc<Logger>>,
    pub(crate) storage: Option<Arc<Storage>>,
    pub(crate) settings: Mutex<Settings>,
    /// Сохранение геометрии окна. `None` до показа окна и при блокировке.
    pub(crate) geometry: Mutex<Option<Arc<GeometrySaver>>>,
}

impl Runtime {
    /// Хранилище или внятный отказ.
    ///
    /// При блокировке запуска хранилища нет вовсе; без этой проверки каждая
    /// команда повторяла бы один и тот же разбор `Option`.
    pub(crate) fn require_storage(&self) -> AppResult<&Storage> {
        self.storage.as_deref().ok_or_else(|| {
            AppError::new(
                "errors.core.noStorage",
                "Хранилище не запущено: приложение заблокировано",
            )
        })
    }
}

//! Подсистемы (модули) платформы.
//!
//! Здесь, помимо самих модулей, живёт「список сборки」 — [`register_all`].
//! Чтобы подключить новую подсистему, достаточно добавить один файл-модуль
//! и одну строку в этом списке. Ядро трогать не нужно.

mod busprobe;
mod dnslookup;

use crate::core::infra::bus::MessageBus;
use crate::core::infra::module::Module;

/// Регистрирует все подсистемы в шине.
///
/// Порядок регистрации внутри модуля строгий: зависимости уже добавлены
/// в шину на этапе `setup`, а публикация событий начнётся только после
/// `bus.start()`.
pub fn register_all(bus: &MessageBus) {
    let modules: Vec<Box<dyn Module>> = vec![
        Box::new(dnslookup::DnsLookupModule::new()),
        Box::new(busprobe::BusprobeModule),
    ];

    for module in &modules {
        log::info!("Регистрация модуля '{}'", module.id());
        module.register(bus);
    }
}

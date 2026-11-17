# 03. Удаление шаблонов из ядра

**Статус:** сделано.

## Цель

Убрать модуль шаблонов, команды, пути хранения и счётчики.

## Объём

- Удалить `src-tauri/src/core/services/templates.rs` (668 строк, 12 тестов).
- `src-tauri/src/core/services/mod.rs`: убрать `pub mod templates`.
- `src-tauri/src/lib.rs`: убрать импорт, шесть команд `templates_list`,
  `template_create`, `template_update`, `template_rename`,
  `template_duplicate`, `template_delete` и их регистрацию.
- `src-tauri/src/core/store/storage.rs`: убрать `TEMPLATES_DIR`,
  `templates_dir`, `templates_trash_dir` и проверки путей в тесте.
- `src-tauri/src/core/store/stats.rs`: убрать `templates` из `StorageStats`
  и `ProfileUsage`, из `profile_usage` и `summary`, поправить тест.
- `src-tauri/src/core/services/profiles.rs`: убрать поле `templates`
  из `Profile` и все его заполнения.

## Приёмка

- В `src-tauri/src/` нет модуля, команд и путей шаблонов.
- `errors.templates.*` больше не используются.
- `cargo check`, `cargo test --lib` проходят; число тестов уменьшилось
  ровно на тесты шаблонов.

## Блокирует

01.

## Comments

- 2026-11-17: удалён `src-tauri/src/core/services/templates.rs` (667 строк),
  `pub mod templates`, шесть команд и их регистрация в `generate_handler!`.
- 2026-11-17: из `storage.rs` убраны `TEMPLATES_DIR`, `templates_dir`
  и `templates_trash_dir`; из `stats.rs` — `templates` в `StorageStats`
  и `ProfileUsage`; из `profiles.rs` — поле `templates` и его заполнения.
- 2026-11-17: `cargo check` проходит. `cargo test --lib` — 158/158: было 170,
  ушли ровно 12 тестов шаблонов, тест счётчиков профиля переименован
  и считает пресеты с данными.

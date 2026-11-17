# 01. Состояние запуска и слой команд

- **Состояние:** в работе

## Что сделать

- `core/runtime.rs`: `Runtime`, `StartupError`, `require_storage`.
- `core/commands/` с файлами по областям.
- `lib.rs`: сборка, `TauriSink`, регистрация, обработка выхода.
- Правило активного профиля — в `profiles::delete`.
- Запрет обратной стрелки в `zone_tests`, абзац в `architecture.md`.

## Готово, когда

- `lib.rs` ≤ 400 строк, ни одной команды и ни одного правила домена.
- 34 команды на месте, регистрация — списком путей.
- `cargo check`, `cargo test --lib`, `cargo clippy --all-targets` зелёные.

# 01. Состояние запуска и слой команд

- **Состояние:** сделано

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

## Итог

- `lib.rs` — 323 строки: `TauriSink`, `boot`, `blocked`, `run`.
- Команды: `core/commands/{bridge,info,languages,lifecycle,presets,profiles,settings,window,workspace}.rs`.
- `core/runtime.rs` — `Runtime`, `StartupError`, `require_storage`.
- Правила профилей вернулись в сервис: `profiles::delete` и `profiles::require_exists`;
  добавлен тест `active_profile_is_not_deleted`.
- `zone_tests` ловит `crate::core::commands` и `crate::core::runtime` из зон;
  проверено временной строкой в `services/data.rs`.
- Тестов стало 160; clippy чист; `lib.rs` и новые файлы проходят `rustfmt --check`.
- Запуск приложения в этой сессии не проверить: WebView2 отвечает
  `HRESULT(0x8007139F)` — среда без рабочего стола. Сборка, линковка
  и тесты зелёные; имена команд и их регистрация не менялись.

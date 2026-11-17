# 03. Язык в настройках и на старте

## Цель

Запомнить выбранный язык в `local/settings.json` и выбрать его до первого
кадра, включая блокирующий экран.

## Объём

- `src/contracts/settings.ts`: `UiSettings.language: string | null`.
- `src-tauri/src/core/services/settings.rs`: поле `language`, проверка тега,
  отказ на путь и разделители.
- `src-tauri/src/lib.rs`: `StartupStatus.language`, язык в `Runtime`,
  передача языка в `blocked`.
- `src/core/services/startup.ts`: поле `language`.
- `src/core/services/settings/index.ts`: `setLanguage`.
- `src/core/services/languages.ts`: загрузка списка, переключение каталога.
- `src/app/locales.ts`: встроенный русский, определение языка при первом
  запуске, сохранение выбора, `document.documentElement.lang`.
- `src/app/main.ts`: `setupLocale()` до `createApp`.

## Приёмка

- `null` означает «как в системе»; выбор определяется один раз и сохраняется.
- Язык блокирующего экрана приходит из `StartupStatus`.
- Смена языка перерисовывает интерфейс без перезапуска.
- Вне Tauri интерфейс работает по-русски и не пишет ошибок.

## Блокирует

02.

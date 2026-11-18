# 01. Вырезать перезапуск вкладки

- **Состояние:** сделано

## Что сделать

- `TabItem.vue`: убрать кнопку меню, событие `menu` и стили `.tab__menu`.
- `TabStrip.vue`: убрать `Menu`, `MenuItem`, `menuTab`, `menuItems`,
  `openMenu`, `useTabRestart`, обработчик `@menu` и компонент `<Menu>`.
- Удалить `useTabRestart.ts`.
- `workspace/index.ts`: удалить `restartTab`, импорт `renameTab`.
- `workspace/recentTabs.ts`: удалить `renameTab`.
- `presets/index.ts`: удалить `defaultTitles`, `defaultPresetTitle`,
  `byTool`, `loadPresetDefaults`, запись названий в `reload` и регистрацию
  в `createPresets`.
- Словари: убрать `tabs.tab.menu`, `tabs.tab.menuTitle`, `tabs.menu.restart`,
  `tabs.restart.*`, `journal.workspace.restarted`,
  `journal.workspace.restartedEmpty`.
- Тесты: убрать перезапуск, перенести свежесть ячеек на `openTool`,
  убрать `defaultPresetTitle` из проверки пресета.
- ADR 0051, пометка ADR 0031, чистка глоссария и комментариев.
- Проверить, что нигде не осталось обещаний перезапуска.

## Готово, когда

- Кнопки и меню вкладки нет.
- В коде нет функций и текстов перезапуска.
- `npm run verify` зелёный.
- Ручной сценарий из спеки пройден.

## Итог

- Кнопка с тремя точками, меню, подтверждение и композабл `useTabRestart`
  удалены; `restartTab` и `renameTab` убраны из сервиса.
- `defaultPresetTitle`, `defaultTitles`, `byTool` и `loadPresetDefaults`
  удалены: подсказка о пресете существовала только в подтверждении.
  Загрузка пресета по умолчанию в новую вкладку сохранена.
- Ключи словарей ru/en и записи журнала о перезапуске удалены.
- Тесты перезапуска удалены; свежесть ячейки проверяется через `openTool`,
  проверка пресета по умолчанию смотрит на `state.defaultId`.
- ADR 0051 фиксирует отказ, ADR 0031 помечен `заменено (ADR 0051)`;
  глоссарий и комментарии очищены от перезапуска.
- `npm run verify` зелёный: 87 тестов интерфейса, 168 тестов Rust,
  линт, сборка. Окно приложения открыто, ошибок в консоли Vite нет.
- Ручная проверка: вкладка без кебаба; закрытие и открытие инструмента
  сбрасывает состояние; пресет по умолчанию приходит в новую вкладку.

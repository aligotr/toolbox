# 02. Разбор рабочего пространства

- **Состояние:** сделано

## Что сделать

- Перенести `parseTab`, `singleTab`, `parseFile` в
  `src/core/services/workspace/parse.ts`.
- Экспортировать `parseWorkspaceFile`; тип отказа определить на месте,
  без импорта журнала.
- `index.ts` вызывает перенесённую функцию; лишние импорты убрать.

## Готово, когда

- `parse.ts` не тянет `vue`, `@tauri-apps/` и `journal` по цепочке.
- Разбор файла не изменился: те же коды отказов, та же дедупликация.
- `npm run build` зелёный.

## Итог

- `src/core/services/workspace/parse.ts` содержит `parseTab`, `singleTab`,
  `parseWorkspaceFile` и локальный `WorkspaceFault`; импорты — контракты,
  константы, `guards`, `layout`, `./constants`.
- `index.ts` вызывает `parseWorkspaceFile`; `isRecord` и `parseColumns`
  из него убраны, остальные импорты (`SINGLETON_TABS`, `EMPTY_TAB_ICON`,
  `WORKSPACE_VERSION`, `WorkspaceFile`) по-прежнему нужны.
- Прогон в Node без заглушки: дубликат вкладки отброшен, второй журнал
  отброшен, битая запись отброшена, версия 2 даёт
  `journal.workspace.version`.

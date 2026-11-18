# 01. Модель списка журнала

- **Состояние:** в работе

## Что сделать

- `src/core/infra/journal.ts`: экспортировать `JOURNAL_LIMIT` и добавить
  `journalSearchText(entry)` - текст для поиска из перевода, источника,
  кода и значений параметров.
- `src/workbench/journalList.ts`: чистые помощники списка:
  `matchesFilters`, `orderEntries`, `dayRows`, `sourceCounts`,
  `highlightParts`, `countNewer` и типы `JournalFilters`, `JournalOrder`,
  `JournalRow`.
- Комментарии и имена - по роли; без состояния и Vue.

## Готово, когда

- Помощники не зависят от Vue и словаря (кроме `journalSearchText`,
  который берёт перевод через `journalText`).
- Типы узкие, `any` нет.

## Comments

- Тесты пишутся после реализации по согласованному списку из спеки.

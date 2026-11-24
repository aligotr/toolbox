# 02. Файл изменений внешнего словаря

Статус: закрыт.

## Работа

- `languages/model.ts`: `missingKeysOf`, `obsoleteKeysOf`,
  `updatesDocumentFor`, `updatesDocument`.
- `languages/state.ts`: счётчики `missing` и `obsolete`, операция `updates`.
- `languages/actions.ts` и `runtime.ts`: `exportUpdates`,
  `language_updates_write`.
- Раздел «Язык»: «Добавить», «Удалить», «Выгрузить изменения».
- Rust: `<code>.updates.jsonc`, `messages` и `obsolete`, счётчики
  `added`/`removed`, шапка файла, удаление старого
  `<code>.missing.jsonc`.
- Тексты RU/EN: «Внешний», «Полный», изменения словаря.
- Тесты: старый ключ становится `obsolete`, новый - `messages`.

## Критерий

- Внешний словарь не перезаписывается.
- Файл изменений показывает, что пришло и что ушло.
- Пустой набор изменений убирает файл.
- Старый файл дополнений больше не создаётся.

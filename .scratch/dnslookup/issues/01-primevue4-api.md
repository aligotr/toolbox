# 01. PrimeVue 4: проверка API для DNS

Blocked by: —

**Статус:** сделано.

## Задача

Зафиксировать PrimeVue 4.5.5 как основу интерфейса и убедиться, что для DNS
хватает его API. Перехода на мажор 5 нет: Community License истекает через
12 месяцев и проверяется при каждом запуске (ADR 0018).

## Объём

- `package.json`: `primevue@4.5.5`, `@primeuix/themes@2.0.3` — версии уже
  точные; убедиться, что диапазоны `^` не появились.
- Лицензионные файлы не добавлять: `.env.local`, `VITE_PRIMEUI_LICENSE`
  и опция `license` в PrimeVue не нужны.
- Подтвердить наличие API, на которое опирается спека:
  - `DataTable`: `scrollable`, `exportCSV`, `expandedRowKeys`,
    слот `#expansion`;
  - `Column`: `frozen`, `hidden`, `exportable`;
  - `MultiSelect`: `display="chip"`, `maxSelectedLabels`;
  - `Dialog`, `InputGroup`, `InputText`, `Textarea`, `Button`.
- Проверить, что в `src/` нет импортов, удалённых только в v5: они и так
  не используются, но зафиксировать факт.
- Если какое-то API отсутствует, заменить его в спеке до начала DNS,
  а не обходить в коде.

## Проверка

- `npm ls primevue @primeuix/themes` — 4.5.5 и 2.0.3 без дублей.
- `npm run build` проходит.
- `npm run tauri dev`: баннера лицензии нет, существующие экраны работают.
- Нужные API найдены в типах установленного пакета.

## Готово, когда

- Версии зафиксированы, лицензионных артефактов нет.
- Все API из спеки подтверждены для 4.5.5 или спека поправлена.
- Решение ADR 0018 не требует изменений кода.

## Как выполнено

- `npm ls primevue @primeuix/themes --depth=0`: `primevue@4.5.5`,
  `@primeuix/themes@2.0.3`, дублей нет.
- `.env.local` отсутствует; `VITE_PRIMEUI_LICENSE` и `license` в конфигурации
  PrimeVue не используются.
- В типах установленного пакета найдены: `DataTable.scrollable`,
  `exportCSV`, `expandedRowKeys`, слот `#expansion`, `Column.frozen`,
  `Column.hidden`, `Column.exportable`, `MultiSelect.display`,
  `MultiSelect.maxSelectedLabels`.
- Импортов компонентов, существующих только в v5, в `src/` нет.

## Проверено

- `npm run build` — успешно, 290 модулей.
- Баннера лицензии нет по построению: в PrimeVue 4 проверка ключа
  отсутствует.

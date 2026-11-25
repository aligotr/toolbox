# Каркас экрана инструмента

Общие части экрана с таблицей. Инструмент приносит строки, колонки, содержимое
раскрытия и операции, а каркас держит разметку, состояние раскрытия и перенос
строк (ADR 0069, ADR 0070, ADR 0071, ADR 0076, ADR 0077).

## Экран

```text
ToolScreen
  slot preset    - шапка с пресетом
  slot default   - тело экрана
  slot overlays  - диалоги и поповеры поверх тела
```

`src/ui/tool/ToolScreen.vue`. Свои классы инструмент ставит на корень через
обычный `class`: у компонента один корневой элемент.

## Таблица

```text
ToolTable<T extends { id: string }>
  props: rows, total, emptyAdd, emptyFiltered, highlightId,
         rowClass, reorderable, markExpanded, draftOpen
  emits: reorder(from, to)
  slots: notice, draft, default(isExpanded, toggle),
         expansion-head(row, isExpanded, toggle), expansion(row)
```

`src/ui/tool/ToolTable.vue`.

- `total` - число строк до фильтра: по нему различаются пустые состояния.
- `highlightId` ищет маркер `data-tool-row` внутри строки и прокручивает к ней.
- `rowClass` задаёт цвет строки и пометку недавнего дубликата.
- `reorderable` по умолчанию включён; `reorder` отдаёт индексы после переноса.
- `markExpanded` включает подсветку раскрытой строки.
- `draftOpen` рисует полосу черновика над первой строкой.
- Раскрытие живёт в таблице: шеврон и клик по имени меняют одно состояние.

## Раскрытие

```text
ToolDetails          props: nested
ToolDetailsSection   слот по умолчанию
ToolExpansionHead    props: rowName, collapseLabel; emits: collapse;
                     slots: name-addon, default
ToolDraftActions     props: disabled, cancelLabel; emits: accept, cancel
ToolNumberField      props: id, label, modelValue, min, max, step, unit,
                            invalid, disabled; emits: update:modelValue
```

- `ToolDetails.nested` рисует отступ и линию вложенности.
- `ToolExpansionHead` липнет к верху прокрутки и держит имя строки в кадре.
- `ToolDraftActions` держит общий вид кнопок принятия и отклонения.
- `ToolNumberField` приводит пустой ввод к нулю и не отдаёт `NaN`.

## Стили

- `src/ui/tool-layout.css` - каркас инструмента с таблицей, классы `tool-*`,
  токены `--tool-*`.
- `src/ui/toolLayout.ts` - общие ширины диалогов.
- Инструмент не копирует разметку, `ResizeObserver`, перенос строк и состояние
  раскрытия. Свои классы несёт BEM-префикс инструмента.

## ADR

- ADR 0069 - общий каркас инструментов.
- ADR 0070 - общие компоненты каркаса.
- ADR 0071 - общая шапка раскрытия.
- ADR 0076 - строка добавления в таблице.
- ADR 0077 - кнопки черновика у края поля.

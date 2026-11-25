# Библиотека готовых элементов

Каталог отвечает на вопрос «что уже есть и как это подключить». Перед новой
реализацией найди элемент здесь и переиспользуй его, а не пиши заново.

Страницы разложены по областям: `ui/` - интерфейс. Позже появятся `core/`,
`rust/` и `tools/`. Имя файла называет элемент, область задаёт папка.

Глубокие страницы есть там, где элемент сложнее одной строки:

- [ui/tables.md](ui/tables.md) - таблица, перенос строк, закреплённые колонки,
  строка добавления.
- [ui/presets.md](ui/presets.md) - панель и диалог пресетов.
- [ui/tool-shell.md](ui/tool-shell.md) - каркас экрана инструмента и раскрытие.
- [ui/popups.md](ui/popups.md) - подтверждения и всплывающие формы.

## UI

### Каркас экрана

| Элемент | Путь | Назначение | ADR |
|---|---|---|---|
| `ToolScreen` | `src/ui/tool/ToolScreen.vue` | Шапка с пресетом, тело и слои поверх тела | 0069, 0070 |
| `ToolDetails` | `src/ui/tool/ToolDetails.vue` | Блок подробностей, вложенная линия | 0070 |
| `ToolDetailsSection` | `src/ui/tool/ToolDetailsSection.vue` | Раздел подробностей | 0070 |
| `ToolExpansionHead` | `src/ui/tool/ToolExpansionHead.vue` | Липкая шапка раскрытия строки | 0071 |
| `ToolDraftActions` | `src/ui/tool/ToolDraftActions.vue` | Пара кнопок принятия и отклонения черновика | 0077 |
| `ToolNumberField` | `src/ui/tool/ToolNumberField.vue` | Числовое поле с общей высотой контрола | 0070 |
| `WindowNumberField` | `src/workbench/settings/WindowNumberField.vue` | Числовое поле настроек окна | 0066, 0067 |
| `tool-layout.css` | `src/ui/tool-layout.css` | Каркас инструмента с таблицей, токены `--tool-*` | 0069, 0070 |
| `toolLayout.ts` | `src/ui/toolLayout.ts` | Общие ширины диалогов инструмента | 0069 |

### Таблица и строки

| Элемент | Путь | Назначение | ADR |
|---|---|---|---|
| `ToolTable` | `src/ui/tool/ToolTable.vue` | Рамка таблицы, пустое состояние, раскрытие, прокрутка к строке | 0070, 0076, 0077, 0079 |
| `useRowDrag` | `src/ui/rowDrag/index.ts` | Перенос строк указателем | 0025, 0079 |
| `PlainSelect` | `src/ui/PlainSelect.vue` | Компактный выбор в строке | 0060 |

### Пресеты

| Элемент | Путь | Назначение | ADR |
|---|---|---|---|
| `ToolPresetBar` | `src/ui/tool/presets/ToolPresetBar.vue` | Имя текущего пресета и быстрые действия | 0072 |
| `ToolPresetCurrent` | `src/ui/tool/presets/ToolPresetCurrent.vue` | Текущий пресет в диалоге | 0072 |
| `ToolPresetRow` | `src/ui/tool/presets/ToolPresetRow.vue` | Строка списка пресетов | 0072 |
| `ToolPresetsDialog` | `src/ui/tool/presets/ToolPresetsDialog.vue` | Список, создание, переименование, копия, удаление, пресет по умолчанию | 0072, 0080 |

### Поповеры и подтверждения

| Элемент | Путь | Назначение | ADR |
|---|---|---|---|
| `anchoredOverlay` | `src/ui/primevue/popup/anchoredOverlay.ts` | Положение всплывающего блока и стрелка | 0060, 0074 |
| `confirmPopup` | `src/ui/primevue/popup/confirmPopup.ts` | Тексты и кнопки подтверждения | 0060 |
| `CONFIRM_*` | `src/core/constants.ts` | Готовые наборы кнопок подтверждения | - |

### Тема

| Элемент | Путь | Назначение | ADR |
|---|---|---|---|
| `theme` | `src/ui/primevue/theme.ts` | Пресет темы PrimeVue: палитра, типографика, радиусы | 0009, 0019, 0022 |
| `global.css` | `src/styles/global.css` | Токены `--ag-*`, база и раскладка оболочки | 0022 |

## Core

| Элемент | Путь | Назначение | ADR |
|---|---|---|---|
| `useAsyncAction` | `src/core/infra/useAsyncAction.ts` | Загрузка, отказ и защита от повторного запуска операции | 0036, 0047 |

## Как добавить элемент

1. Выбери область и создай страницу в её папке по шаблону
   `.agents/auxiliary/templates/library-page.md`.
2. Добавь строку в раздел области: элемент, путь, назначение, ADR.
3. Если элемент заменяет старый, отметь это в ADR и в странице.

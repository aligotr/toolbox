# Пресеты: панель и диалог

Общий интерфейс пресетов инструмента. Компоненты не знают домена: инструмент
приносит операции сеанса и ключи подписей. Разметка, список и сценарий живут
один раз (ADR 0028, ADR 0032, ADR 0072, ADR 0080).

## Пути

- `src/ui/tool/presets/ToolPresetBar.vue` - панель в шапке экрана.
- `src/ui/tool/presets/ToolPresetCurrent.vue` - текущий пресет в диалоге.
- `src/ui/tool/presets/ToolPresetRow.vue` - строка списка.
- `src/ui/tool/presets/ToolPresetsDialog.vue` - список и действия.
- `src/ui/tool/presets/types.ts` - `PresetDialogSource`, `PresetBarTexts`,
  `PresetDialogTexts`.
- `src/ui/tool/presets/texts.ts` - общие подписи панели и диалога.

## Панель

```text
ToolPresetBar
  props: title, presetTitle, changed, saving, saveError, texts, save(), revert()
  emits: open, note
```

- `presetTitle = null` показывает кнопку входа в список.
- `changed` включает пометку расхождения с сохранённым пресетом.
- `open` открывает диалог; `note` отдаёт текст уведомления или `null`.

## Диалог

```text
ToolPresetsDialog
  props: visible, source: PresetDialogSource, texts: PresetDialogTexts
  emits: update:visible, applied
```

`PresetDialogSource` - единственная связь с инструментом:

- `presets` - список и файловые операции;
- `bound`, `presetTitle`, `changed`, `occupied`, `running` - состояние сеанса;
- `load`, `startNew`, `revert`, `save`, `create`, `adoptTitle`,
  `releaseDeleted` - операции.

Диалог не читает файлы сам и не знает формат payload. Успешная загрузка
закрывает диалог, итог показывается уведомлением.

## Подключение

1. Инструмент собирает `source` в своём `use<Инструмент>.ts`.
2. Добавляет доменные подтверждения к `PresetDialogBaseTexts` и передаёт
   `texts` в диалог.
3. Ставит `ToolPresetBar` в слот `preset` компонента `ToolScreen`.
4. Ставит `ToolPresetsDialog` в слот `overlays`.
5. Локальные подписи держит в `components/presetTexts.ts` инструмента.

## Ограничения

- Доменное имя, формат пресета и применение настроек остаются у инструмента.
- Общие подписи живут в `presets` словаря; доменные замены - у инструмента.
- Пресет по умолчанию действует на новые вкладки и не трогает открытый сеанс.
- Панель и диалог не копируются в инструмент.

## ADR

- ADR 0028 - модель пресетов.
- ADR 0032 - управление пресетом в шапке.
- ADR 0072 - общий интерфейс пресетов.
- ADR 0080 - новый пресет из чистого состояния.

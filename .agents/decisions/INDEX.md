# Указатель решений

Производный обзор ADR. Источник истины - сами ADR. Новый ADR добавляет строку
сюда; старые строки не переписываются без причины.

## Заменённые

| ADR | Решение | Заменено на |
|---|---|---|
| [0006](0006-live-trace.md) | Живая трассировка шины | [0007](0007-teaching-trace.md) |
| [0015](0015-primevue-5.md) | Интерфейс на PrimeVue 5 | [0018](0018-primevue-4.md) |
| [0023](0023-heading-gap-token.md) | Токен отступа после заголовка экрана | [0024](0024-heading-gap-rule.md) |
| [0024](0024-heading-gap-rule.md) | Отступ заголовка задаётся правилом, а не gap контейнера | [0053](0053-heading-owns-gap.md) |
| [0029](0029-reopen-tab.md) | Переоткрытие вкладки вместо сброса настроек инструмента | [0031](0031-restart-tab.md) |
| [0031](0031-restart-tab.md) | Перезапуск вкладки | [0051](0051-remove-tab-restart.md) |
| [0041](0041-single-instance-tab.md) | Единственная вкладка | [0042](0042-single-tool-tab.md) |

## Действующие и уточнённые

| ADR | Решение | Статус | Область |
|---|---|---|---|
| [0001](0001-message-bus-model.md) | Модель шины - события, команды и `ask` | принято | `src-tauri/src/core/`, все подсистемы |
| [0002](0002-topics-and-ui-bridge.md) | Топики и мост между Rust и интерфейсом | принято | `src-tauri/src/core/`, `src-tauri/src/lib.rs`, `src/core/infra/bus.ts` |
| [0003](0003-dependency-injection-and-init-order.md) | Внедрение зависимостей и порядок инициализации | принято | `src-tauri/src/core/infra/deps.rs`, `src-tauri/src/core/infra/bus.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/modules/` |
| [0004](0004-logging.md) | Логирование отказов в файл рядом с программой | принято; умолчание уровня уточнено ADR 0055 | `src-tauri/src/core/services/logging.rs`, `src-tauri/src/core/infra/bus.rs`, `src-tauri/src/lib.rs`, мост в интерфейс |
| [0005](0005-portable-root-and-init-order.md) | Портативный корень, проверка записи и порядок инициализации | принято | `src-tauri/src/core/store/storage.rs`, `src-tauri/src/core/services/settings.rs`, `src-tauri/src/lib.rs`, интерфейс (блокирующий экран) |
| [0007](0007-teaching-trace.md) | Учебный прогон - запись реальной цепочки и проигрывание | принято (в части проигрывания заменено ADR 0020, дополнено 2026-11-18) | `src-tauri/src/core/infra/trace.rs`, `src-tauri/src/core/infra/bus.rs`, `src/core/infra/journal.ts`, модуль «Как работает шина» |
| [0008](0008-bus-failures.md) | Отказы шины - что в лог, что в журнал | принято | `src-tauri/src/core/infra/bus.rs`, `src-tauri/src/lib.rs`, `src/core/infra/journal.ts` |
| [0009](0009-ui-primevue.md) | Интерфейс на PrimeVue как основа | принято; тёмная схема заменена ADR 0019 | `package.json`, `src/styles/global.css`, `src/ui/`, все экраны интерфейса |
| [0010](0010-storage-profiles-sync.md) | Хранение состояния - файлы, профили и границы синхронизации | принято | `src-tauri/src/core/store/storage.rs`, `src-tauri/src/core/services/settings.rs`, `src-tauri/src/lib.rs`, сервис данных инструментов, раскладка папки программы |
| [0011](0011-shell-tabs-sidebar.md) | Оболочка - вкладки, сайдбар и шаблоны вкладок | принято | `src/app/App.vue`, `src/app/tools.ts`, оболочка рабочего пространства, `local/workspace.json` |
| [0012](0012-layers-and-module-contract.md) | Слои, контракт модуля и стиль Vue | принято | `src/`, `src-tauri/src/`, правила проекта |
| [0013](0013-primevue-major-pin.md) | Мажорная версия PrimeVue зафиксирована на 4 | принято (восстановлено ADR 0018) | `package.json`, `src/app/main.ts`, `src/ui/primevue/theme.ts` |
| [0014](0014-window-geometry.md) | Геометрия окна - свои единицы и своё сохранение | принято | `src-tauri/src/core/services/window.rs`, `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`, раздел `window` в `local/settings.json` |
| [0016](0016-dns-hickory-proto.md) | DNS-запросы - hickory-proto и свой транспорт | принято | `src-tauri/Cargo.toml`, `src-tauri/src/modules/dnslookup/` |
| [0017](0017-cell-key-session.md) | Состояние инструмента привязано к ячейке (cellKey) | принято | `src/contracts/tools.ts`, `src/workbench/workspace/ToolGrid.vue`, `src/workbench/workspace/WorkspaceView.vue`, `src/tools/dnslookup/` |
| [0018](0018-primevue-4.md) | PrimeVue остаётся на мажоре 4 | принято | `package.json`, `src/ui/primevue/theme.ts`, `src/app/main.ts`, `.agents/specs/archive/dnslookup.md` |
| [0019](0019-light-theme.md) | Светлая тема и тёмно-зелёный акцент | принято | `src/ui/primevue/theme.ts`, `src/styles/global.css`, `src/app/main.ts`, `src/workbench/`, `src/tools/` |
| [0020](0020-ping-without-playback.md) | Путь сообщения без пошагового проигрывания | принято | `src/tools/icmp/IcmpView.vue`, `src/tools/icmp/useIcmp.ts` |
| [0021](0021-typography-scale.md) | Типографика - корень 16 px, основной текст 14 px | принято | `src/ui/primevue/theme.ts`, `src/styles/global.css`, `.agents/rules/project/ui/design.md`, экраны `src/workbench/`, `src/tools/` |
| [0022](0022-spacing-radius-text-tokens.md) | Токены отступов, радиусов и текста | принято | `src/styles/global.css`, `src/ui/primevue/theme.ts`, `.agents/rules/project/ui/architecture.md`, стили `src/workbench/` и `src/tools/` |
| [0025](0025-row-drag-pointer-events.md) | Перенос строк таблицы ведётся указателями, а не drag-and-drop | принято | `src/ui/rowDrag/index.ts`, `src/ui/rowDrag/rowDrag.css`, `src/tools/dnslookup/` |
| [0026](0026-frozen-column-offset.md) | Отступ закреплённой колонки пересчитывается по текущей ширине | принято | `src/tools/dnslookup/components/DnsTable.vue` |
| [0027](0027-domain-column-width.md) | Колонка домена считается по содержимому и имеет потолок ширины | принято | `src/tools/dnslookup/components/DnsTable.vue`, `src/tools/dnslookup/constants.ts` |
| [0028](0028-tool-presets.md) | Пресеты настроек инструментов | принято; раздел «Данные» упразднён ADR 0056; интерфейс пресетов уточнён ADR 0072 | `src-tauri/src/core/services/presets.rs`, `profiles/<id>/presets/`, `src/contracts/presets.ts`, `src/tools/dnslookup/` |
| [0030](0030-default-preset.md) | Пресет по умолчанию для инструмента | принято | `src-tauri/src/core/services/profiles.rs`, `src-tauri/src/core/services/presets.rs`, `src-tauri/src/lib.rs`, `src/contracts/presets.ts`, `src/contracts/workspace.ts`, `src/tools/dnslookup/`, `profiles/<id>/profile.json` |
| [0032](0032-tool-header-preset-control.md) | Шапка инструмента: имя и управление пресетом в одной строке | принято; зазор после шапки уточнён ADR 0053 | `src/tools/dnslookup/DnslookupView.vue`, `src/tools/dnslookup/components/PresetsDialog.vue`, `src/tools/dnslookup/constants.ts`, `.agents/rules/project/ui/elements.md` |
| [0033](0033-heading-color-token.md) | Цвет заголовка экрана - отдельный приглушённый токен | принято | `src/styles/global.css`, `.agents/rules/project/ui/design.md`, стили экранов `src/app/`, `src/workbench/`, `src/tools/` |
| [0034](0034-record-type-outside-preset.md) | Тип новых строк - состояние сеанса, а не пресета | принято | `src/tools/dnslookup/types.ts`, `src/contracts/presets.ts`, формат `payload` пресета DNSlookup |
| [0035](0035-core-zones.md) | Зоны ядра - инфраструктура, хранилище, сервисы | принято | `src-tauri/src/core/`, `src/core/`, `src/contracts/`, `src-tauri/src/lib.rs`, `scripts/check-zones.mjs`, `package.json` |
| [0036](0036-module-boundaries.md) | Границы модуля интерфейса - слои, алиас, размеры и стили | принято | `src/`, `scripts/check-zones.mjs`, `vite.config.ts`, `tsconfig.json`, `.agents/rules/` |
| [0037](0037-workbench-shared-styles.md) | Общие стили оболочки - каркас экрана и пункт рейла | принято | `src/workbench/`, `.agents/rules/project/ui/architecture.md` |
| [0038](0038-module-order.md) | Порядок модуля - роль в имени файла и папки-области | принято | `src/`, `.agents/rules/project/` |
| [0039](0039-i18n.md) | Мультиязычность интерфейса | принято; встроенных языков два, правило внешних словарей уточнено ADR 0057, расширение словарей - ADR 0059, ключи и файл изменений - ADR 0081 | `src/`, `tests/`, `src-tauri/src/`, `src/core/infra/i18n/`, `scripts/`, `.agents/rules/project/` |
| [0040](0040-empty-tab-yields.md) | Пустая вкладка уступает место содержимому | принято | `src/core/services/workspace/index.ts`, полоса вкладок, пустая вкладка |
| [0042](0042-single-tool-tab.md) | Одна вкладка на инструмент и «последняя активная» | принято | `src/contracts/tools.ts`, `src/core/services/workspace/index.ts`, дескрипторы инструментов, `src/workbench/sidebar/Sidebar.vue`, `src/workbench/sidebar/RailItem.vue`, `src/workbench/workspace/EmptyTab.vue`, `src/workbench/toolGestures.ts` |
| [0043](0043-tab-strip-scroll.md) | Прокрутка полосы вкладок | принято | `src/workbench/tabs/TabStrip.vue`, `src/workbench/tabs/useStripScroll.ts`, `src/core/services/workspace/index.ts`, `src/ui/primevue/theme.ts`, словари ru/en |
| [0044](0044-rail-tooltips.md) | Подсказки пунктов рейла | принято | `src/workbench/sidebar/RailItem.vue`, `src/ui/primevue/theme.ts` |
| [0045](0045-tab-strip-visible-zone.md) | Видимая зона полосы вкладок | принято | `src/workbench/tabs/TabStrip.vue`, `src/workbench/tabs/useStripScroll.ts` |
| [0046](0046-drop-tab-templates.md) | Отказ от шаблонов вкладок | принято; раздел «Данные» упразднён ADR 0056 | `src/`, `src-tauri/src/`, словари ru/en, `.agents/` |
| [0047](0047-vue-only-for-state.md) | Vue в ядре - только реактивность состояния | принято | `src/core/`, `src/tools/dnslookup/`, `scripts/check-zones.mjs`, `.agents/rules/` |
| [0048](0048-tauri-commands-layer.md) | Команды Tauri - отдельный слой `core/commands/` | принято | `src-tauri/src/lib.rs`, `src-tauri/src/core/commands/`, `src-tauri/src/core/runtime.rs`, `.agents/rules/project/architecture.md` |
| [0049](0049-direct-commands.md) | Прямые команды Tauri и команды шины | принято | `src/core/services/`, `src/core/infra/bus.ts`, `src-tauri/src/core/commands/` |
| [0050](0050-profile-workspace.md) | Рабочее пространство принадлежит профилю | принято | `src-tauri/src/core/store/storage.rs`, `src-tauri/src/core/commands/{workspace,profiles}.rs`, `src-tauri/src/core/services/{workspace,profiles}.rs`, `src-tauri/src/lib.rs`, `src/core/services/workspace/`, `README.md`, `.agents/GLOSSARY.md` |
| [0051](0051-remove-tab-restart.md) | Отказ от перезапуска вкладки | принято | `src/workbench/tabs/`, `src/core/services/workspace/`, `src/core/services/presets/`, `src/core/infra/i18n/messages.ts`, `src/core/infra/i18n/messages.en.ts`, `tests/workspace/tabs.test.ts`, `.agents/GLOSSARY.md` |
| [0052](0052-journal-session-scope.md) | Журнал остаётся сеансовым | принято | `src/core/infra/journal.ts`, `src/core/infra/constants.ts`, `src/workbench/journal/JournalView.vue`, `src/workbench/journal/journalList.ts`, `src/workbench/journal/useJournalView.ts`, `.agents/GLOSSARY.md` |
| [0053](0053-heading-owns-gap.md) | Отступ после шапки экрана принадлежит шапке | принято | `src/workbench/styles.css`, `src/workbench/`, `src/tools/`, `.agents/rules/project/ui/design.md` |
| [0054](0054-dnslookup-add-row-layout.md) | Строка добавления DNS: ширина по роли и одна высота | принято; часть о списке резолверов уточнена ADR 0074, место строки добавления - ADR 0076 | `src/tools/dnslookup/styles.css`, `src/tools/dnslookup/components/DnsTable.vue`, `src/tools/dnslookup/constants.ts`, `.agents/rules/project/ui/elements.md` |
| [0055](0055-log-default-level.md) | Умолчание уровня лога - `error` | принято | `src-tauri/src/core/services/logging.rs`, `src-tauri/src/core/services/settings.rs`, `src/core/services/settings/index.ts`, `src/workbench/settings/sections/LogSection.vue`, словари ru/en |
| [0056](0056-drop-data-section.md) | Упразднение раздела настроек «Данные» | принято | `src/workbench/settings/`, `src/core/services/`, `src/contracts/`, `src-tauri/src/core/`, словари ru/en |
| [0057](0057-two-builtin-languages.md) | Два встроенных языка и внешние словари | принято; расширение словарей `.jsonc` уточнено ADR 0059, ключи и файл изменений - ADR 0081 | `src/app/locales.ts`, `src/core/services/languages/`, `src/workbench/settings/sections/LanguageSection.vue`, `src-tauri/src/core/services/languages.rs`, `src-tauri/src/core/commands/languages.rs`, `src/core/infra/i18n/`, ADR 0039, словари ru/en |
| [0058](0058-notifications.md) | Уведомления поверх экрана | принято | `src/core/infra/notifications.ts`, `src/app/NotificationHost.vue`, `src/app/main.ts`, `src/ui/primevue/theme.ts`, `src-tauri/src/core/infra/notifications.rs`, `.agents/rules/project/ui/elements.md` |
| [0059](0059-jsonc-dictionaries.md) | Расширение jsonc для словарей | принято | `src-tauri/src/core/services/languages.rs`, `src-tauri/src/core/commands/languages.rs`, `src/core/services/languages/`, `.agents/specs/archive/languages-notifications.md`, правила `i18n.md`, глоссарий |
| [0060](0060-area-folder-from-two-files.md) | Папка-область с двух файлов | принято | `.agents/decisions/0036-module-boundaries.md`, `0038-module-order.md`, `.agents/rules/project/vue.md`, `src/ui/primevue/` |
| [0061](0061-deletion-and-trash.md) | Удаление данных и корзина | принято | `src-tauri/src/core/services/trash.rs`, `profiles.rs`, `presets.rs`, `languages.rs`, `src-tauri/src/core/commands/`, `src-tauri/src/core/store/storage.rs`, `src-tauri/src/lib.rs`, `.agents/rules/project/quality.md`, `.agents/rules/project/i18n.md`, `README.md`, `.agents/GLOSSARY.md`, тексты `dnslookup.preset.removed` |
| [0062](0062-launch-catalog.md) | Экран запуска как каталог | принято | `src/workbench/workspace/EmptyTab.vue`, `src/workbench/workspace/CatalogCard.vue`, `src/core/services/presets/defaultPreset.ts`, `src/core/constants.ts`, словари |
| [0063](0063-no-redundant-tooltips.md) | Подсказка не повторяет видимое | принято | `src/workbench/workspace/EmptyTab.vue`, `src/workbench/tabs/TabItem.vue`, словари ru/en, `.agents/rules/project/ui/elements.md` |
| [0064](0064-window-snap.md) | Прилипание окна к краям рабочей области | принято | `src-tauri/src/core/services/window.rs`, `src-tauri/src/core/commands/window.rs`, `src-tauri/Cargo.toml` |
| [0065](0065-window-snap-detach.md) | Порог прилипания и отрыв окна | принято | `src-tauri/src/core/services/window.rs`, `src-tauri/src/core/commands/window.rs`, `src-tauri/src/core/runtime.rs`, `src-tauri/Cargo.toml` |
| [0066](0066-window-position-input.md) | Ручной ввод положения окна | принято | `src-tauri/src/core/services/window.rs`, `src-tauri/src/core/services/settings.rs`, `src-tauri/src/core/commands/window.rs`, `src/workbench/settings/sections/WindowSection.vue`, `src/core/services/settings/index.ts` |
| [0067](0067-window-size-input.md) | Ручной ввод размера окна | принято | `src-tauri/src/core/services/window.rs`, `src-tauri/src/core/services/settings.rs`, `src-tauri/src/core/commands/window.rs`, `src/workbench/settings/sections/WindowSection.vue`, `src/core/services/settings/index.ts` |
| [0068](0068-ping-icmp.md) | Ping через ICMP и переносимый транспорт | принято; CSV уточнён ADR 0073, бесконечная серия и хранение пакетов - ADR 0075 | `src-tauri/src/modules/icmp/`, `src-tauri/src/modules/mod.rs`, `src-tauri/Cargo.toml`, `src/tools/icmp/`, `src/app/tools.ts` |
| [0069](0069-shared-tool-layout.md) | Общая раскладка инструментов с таблицей | принято; компонентная часть каркаса уточнена ADR 0070, полоса добавления убрана ADR 0076 | `src/ui/tool-layout.css`, `src/ui/toolLayout.ts`, `src/app/main.ts`, `src/tools/dnslookup/`, `src/tools/icmp/`, `.agents/rules/project/ui/architecture.md`, `.agents/rules/project/vue.md` |
| [0070](0070-shared-tool-components.md) | Общие компоненты инструментов с таблицей | принято; шапка раскрытия уточнена ADR 0071, CSV уточнён ADR 0073 | `src/ui/tool/`, `src/ui/tool-layout.css`, `src/tools/dnslookup/`, `src/tools/icmp/`, `.agents/rules/project/ui/architecture.md`, `.agents/rules/project/vue.md` |
| [0071](0071-shared-expansion-head.md) | Общая шапка раскрытия строки | принято | `src/ui/tool/ToolExpansionHead.vue`, `src/ui/tool/ToolTable.vue`, `src/ui/tool-layout.css`, `src/tools/dnslookup/`, `src/tools/icmp/`, `.agents/rules/project/ui/architecture.md`, `.agents/rules/project/vue.md` |
| [0072](0072-shared-preset-ui.md) | Общий интерфейс пресетов | принято | `src/core/services/presets/`, `src/ui/tool/presets/`, `src/tools/dnslookup/`, `src/tools/icmp/`, `.agents/rules/project/ui/architecture.md`, `.agents/rules/project/vue.md` |
| [0073](0073-no-csv-and-clear.md) | Инструменты не выгружают CSV и не очищают таблицу | принято | `src/tools/dnslookup/`, `src/tools/icmp/`, `src/core/infra/i18n/`, `tests/`, `.agents/specs/archive/dnslookup.md`, `.agents/specs/archive/icmp.md` |
| [0074](0074-dns-server-popover.md) | Серверы DNS выбираются в поповере, а не в строке добавления | принято; место строки добавления уточнено ADR 0076 | `src/tools/dnslookup/`, `.agents/rules/project/ui/elements.md`, `.agents/specs/archive/dnslookup.md` |
| [0075](0075-ping-endless.md) | Ping умеет проверять бесконечно и хранит только последние пакеты | принято | `src-tauri/src/modules/icmp/`, `src/tools/icmp/`, `.agents/specs/archive/icmp.md` |
| [0076](0076-draft-row-in-table.md) | Строка добавления живёт в таблице, а не отдельной полосой | принято | `src/ui/tool/ToolTable.vue`, `src/ui/tool-layout.css`, `src/tools/dnslookup/`, `src/tools/icmp/`, `.agents/rules/project/ui/elements.md`, `.agents/specs/archive/dnslookup.md`, `.agents/specs/archive/icmp.md` |
| [0077](0077-draft-row-actions-at-field-end.md) | Кнопки строки добавления стоят в конце поля | принято | `src/ui/tool-layout.css`, `src/ui/tool/ToolTable.vue`, `src/tools/dnslookup/`, `src/tools/icmp/`, `.agents/rules/project/ui/elements.md`, `.agents/specs/archive/dnslookup.md`, `.agents/specs/archive/icmp.md` |
| [0078](0078-common-system-texts.md) | Универсальные системные тексты живут в `common` | принято | `src/core/infra/i18n/`, `.agents/rules/project/i18n.md`, `src/tools/`, `src/workbench/` |
| [0079](0079-row-drag-first-cell.md) | Перенос строки начинается с любой точки первой ячейки | принято | `src/ui/tool/ToolTable.vue`, `.agents/library/ui/tables.md`, `.agents/rules/project/ui/elements.md` |
| [0080](0080-new-preset-from-clean-state.md) | Пресет создаётся с чистых настроек | принято | `src/ui/tool/presets/`, `src/core/services/presets/`, `src/tools/dnslookup/`, `src/tools/icmp/`, `.agents/specs/archive/presets.md` |
| [0081](0081-dictionary-keys-and-changes.md) | Ключи словаря и файл изменений | принято | `src/core/infra/i18n/`, `src/core/services/languages/`, `scripts/check-messages.mjs`, `.agents/rules/project/i18n.md` |
| [0082](0082-memory-and-workspace.md) | Память проекта, записная книжка и библиотека готовых элементов | принято | `.agents/`, `AGENTS.md`, `.scratch/`, правила агентов |

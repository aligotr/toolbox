# 02. Удаление шаблонов из интерфейса

**Статус:** сделано.

## Цель

Убрать сервис шаблонов, привязки и все точки входа в интерфейсе.

## Объём

- Удалить `src/core/services/templates/`, `src/contracts/templates.ts`,
  `src/workbench/settings/sections/TemplatesSection.vue`,
  `src/workbench/tabs/TemplateTitleDialog.vue`,
  `src/workbench/tabs/CloseTabDialog.vue`,
  `src/workbench/tabs/useTemplateTitle.ts`,
  `src/workbench/tabs/useTabClose.ts`,
  `src/workbench/tabs/templateBinding.ts`.
- `src/contracts/workspace.ts`: убрать `Binding` и поле `bindings`.
- `src/core/services/workspace/index.ts`: убрать `applyTemplate`,
  `openTemplate`, разбор и запись привязок, перенос привязки при перезапуске.
- `src/workbench/tabs/`: полоса, вкладка и меню без маркеров, диалогов
  и операций шаблона; меню оставляет перезапуск.
- `src/workbench/workspace/EmptyTab.vue`: убрать карточки шаблонов.
- `src/workbench/settings/`: убрать раздел «Шаблоны» из реестра и экрана,
  строку шаблонов из «Данных», счётчик шаблонов из профилей.
- `src/workbench/WorkbenchView.vue`, `src/workbench/constants.ts`,
  `src/workbench/plural.ts`: убрать загрузку шаблонов, предел названия
  и подпись количества.
- `src/contracts/data.ts`, `src/contracts/profiles.ts`: убрать счётчики
  шаблонов.
- `src/core/infra/i18n/messages.ts`, `src-tauri/resources/languages/en.json`:
  удалить ключи шаблонов и связок из обоих словарей.

## Приёмка

- В `src/` не осталось импортов и текстов о шаблонах вкладок.
- Пустая вкладка: заголовок, инструменты, состояние ядра.
- Меню вкладки: только перезапуск с подтверждением.
- `workspace.json` не содержит `bindings`.
- `npm run build`, `npm run test`, `check-messages` проходят.

## Блокирует

01.

## Comments

- 2026-11-17: удалены сервис шаблонов и привязок, контракт, раздел настроек,
  диалоги названия и закрытия, композаблы меню и названия, `templateBinding.ts`
  и `workbench/constants.ts`. Полоса вкладок оставляет перезапуск, пустая
  вкладка — инструменты и состояние ядра.
- 2026-11-17: `workspace.json` больше не содержит `bindings`: поле убрано
  из контракта, разбор секции и подписка на связки удалены. Версия 1 осталась.
- 2026-11-17: из обоих словарей удалены ключи шаблонов, привязок, счётчиков
  и ошибок домена; тексты пустой вкладки, настроек, профилей и «Данных»
  поправлены. Заодно убраны осиротевшие `toolsLabel` и `count.tools`.
- 2026-11-17: после удаления второго потребителя `useRename.ts` переименование
  профиля переехало в `ProfilesSection.vue` — правило `vue.md` запрещает
  обёртку с единственным вызовом.
- 2026-11-17: проверки: `npm run test` 19/19, `npm run build`,
  `check-messages` 598/598, `vue-tsc`, `check-zones`.

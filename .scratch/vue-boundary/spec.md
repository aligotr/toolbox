# Граница Vue: правила без фреймворка

Решение — ADR 0047. Цель: Vue в ядре остаётся только механизмом
наблюдаемого состояния; правила перестают зависеть от него и проверяются
без заглушек.

## Что входит

- Вынос разбора `local/workspace.json` из реактивного `workspace/index.ts`
  в `workspace/parse.ts`.
- Проверка DNS-ввода возвращает код словаря и данные, перевод — на месте
  вызова.
- Правило в `.agents/rules/project/architecture.md` и проверка в
  `scripts/check-zones.mjs`.

## Что не входит

- Отказ от `reactive`/`ref` в ядре (отклонено в ADR 0047).
- Тесты интерфейса (отдельная задача `.scratch/audit`).
- Изменение формата `workspace.json`, текстов словаря и поведения продукта.

## Критерии приёмки

1. `src/core/services/workspace/parse.ts` импортирует только контракты,
   константы, `guards`, `layout` и `./constants`; `vue`, `@tauri-apps/`
   и `journal` недостижимы по цепочке импортов.
2. `workspace/index.ts` вызывает `parseWorkspaceFile`; поведение разбора
   не изменилось.
3. `normalize.ts` не импортирует `i18n`; его результат в отказе —
   `{ code, params }`; тексты собираются в `state/rows.ts` и
   `ServerDialog.vue`.
4. `check-zones` падает при импорте Vue в файле ядра вне списка держателей
   и при цепочке от модуля правил до Vue/Tauri.
5. `npm run build`, `npm run test`, `cargo check`, `cargo test --lib`
   проходят; словарь остаётся 598 ключей.

## Проверка

- временно добавить `import { reactive } from "vue"` в `guards.ts` —
  сборка падает с указанием файла;
- временно добавить `import { t } from "../../infra/i18n"` в `parse.ts` —
  сборка падает с цепочкой импортов;
- обе правки откатить, сборка снова зелёная.

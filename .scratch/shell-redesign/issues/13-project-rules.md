# 13. Правила проекта

Blocked by: —

**Статус:** сделано.

## Задача

Перенести правила соседнего Nuxt-проекта в проектные, с адаптацией под
Tauri и Vue 3.

## Что сделано

- `.agents/rules/project/architecture.md` — слои, контракт модуля,
  composition root, транспорт.
- `.agents/rules/project/vue.md` — Composition API, `<script setup>`,
  разделение `api.ts` / `use*` / `*View.vue`, PrimeVue.
- `.agents/rules/project/rust.md` — структура, модули, ошибки, логирование,
  тесты.
- `.agents/rules/project/ui.md` — токены, типографика, раскладка, состояния.
- `.agents/rules/project/quality.md` — проверки, признак готовности,
  лог и журнал.
- `.agents/rules/project/agents-guard.yml` — разрешённые и запрещённые
  команды, обязательные проверки.
- `AGENTS.md` переписан: базовые инварианты, карта правил, приоритеты,
  стек, проверки.
- `.agents/decisions/0012-layers-and-module-contract.md` — решение по слоям
  и стилю Vue.
- Глоссарий дополнен терминами слоёв и интерфейса.

## Что осталось на будущее

- `.agents/rules/projects-nuxt/` остаётся справочником; в `AGENTS.md`
  помечено, что он не действует.
- Мутационное тестирование и карта `TESTS.md` не внедряются: для личного
  инструмента это лишний процесс.

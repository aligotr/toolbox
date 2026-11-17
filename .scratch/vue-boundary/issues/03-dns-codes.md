# 03. Коды проверки DNS

- **Состояние:** сделано

## Что сделать

- Убрать `t` из `src/tools/dnslookup/normalize.ts`.
- В отказе возвращать `{ ok: false, code, params }`; код — строковый
  литерал `dnslookup.validate.*`, чтобы `check-messages` его видел.
- Перевести код в текст в `state/rows.ts` и `ServerDialog.vue`.

## Готово, когда

- `normalize.ts` не импортирует `@/core/infra/i18n`.
- Все прежние ключи `dnslookup.validate.*` остаются в словаре и
  распознаются проверкой полноты.
- `npm run build` показывает 598 ключей.

## Итог

- Отказ — `{ ok: false, code, params }`; `params` типизированы
  `MessageParams` из `i18n/types` (тип без поведения и без Vue).
- Перевод: `t(parsed.code, parsed.params)` в `state/rows.ts`
  и `components/ServerDialog.vue`.
- `check-messages`: русский словарь полон, 598 ключей; `en` — 598.
- Прогон в Node: `Example.COM.` → `example.com` (показ `Example.COM`),
  пустой ввод → `dnslookup.validate.emptyAddress`, порт 99999 →
  `dnslookup.validate.badServer` с `params.address`.

# 03. Коды записей и глоссарий

- **Состояние:** в работе

## Что сделать

- `src/tools/dnslookup/state/servers.ts`: писать в журнал `journal.*`-коды,
  разведённые с сообщениями панели:
  `dnslookup.servers.brokenFile` -> `journal.dnslookup.serversBrokenFile`,
  `dnslookup.servers.saveFailed` -> `journal.dnslookup.serversSaveFailed`
  (с причиной) и `journal.dnslookup.serversNotSaved` (без причины).
- `src/tools/dnslookup/state/run.ts`: `dnslookup.run.tooMany` ->
  `journal.dnslookup.runTooMany` в записи журнала.
- Словари ru/en: новые ключи журнала рядом с существующими
  `dnslookup`-ключами панели.
- `.agents/GLOSSARY.md`: исправить источник журнала (не «события шины»,
  а модуль или ядро) и добавить термин «Вид записи».
- `.agents/decisions/0052-journal-session-scope.md`: решение о сеансовом
  журнале.

## Готово, когда

- Ни одна запись журнала не пишется под кодом панели.
- Глоссарий не противоречит коду.

## Comments

- Расхождение: глоссарий обещал источник «события шины», код пишет явно.

// Проверки списка журнала.
//
// Помощники списка чистые: отбор, порядок, дни, прирост и подсветка.
// Словарь ставится как в приложении: без него `journalText` вернул бы код,
// и поиск проверял бы не то, что видит человек.
//
// Ожидаемые значения — литералы, а не вывод проверяемого кода.

import assert from "node:assert/strict";
import test from "node:test";
import { installBuiltin } from "../../src/core/infra/i18n/index.ts";
import { ruMessages } from "../../src/core/infra/i18n/messages.ts";
import type { JournalEntry, JournalKind, JournalParams } from "../../src/core/infra/journal.ts";
import {
  countNewer,
  dayRows,
  highlightParts,
  matchesFilters,
  orderEntries,
  sourceCounts,
  type JournalFilters,
} from "../../src/workbench/journalList.ts";

installBuiltin(ruMessages);

/** Полдень 18 ноября 2026 местного времени. */
const DAY_ONE = new Date(2026, 10, 18, 12, 0, 0).getTime();
/** Утро следующего дня. */
const DAY_TWO = new Date(2026, 10, 19, 9, 0, 0).getTime();

/** Запись журнала с заполненными обязательными полями. */
function entry(
  id: number,
  at: number,
  source: string,
  kind: JournalKind,
  code: string,
  params: JournalParams = {},
): JournalEntry {
  return { id, at, source, kind, code, params };
}

/** Условия показа без отбора. */
function filters(overrides: Partial<JournalFilters> = {}): JournalFilters {
  return { query: "", onlyErrors: false, sources: [], ...overrides };
}

test("пустой запрос оставляет запись", () => {
  const item = entry(1, DAY_ONE, "core", "info", "journal.settings.language", {
    language: "ru",
  });

  assert.equal(matchesFilters(item, filters()), true);
});

test("запрос без совпадений отбрасывает запись", () => {
  const item = entry(1, DAY_ONE, "core", "info", "journal.settings.language", {
    language: "ru",
  });

  assert.equal(matchesFilters(item, filters({ query: "щщщ" })), false);
});

test("запрос находит запись по коду", () => {
  const item = entry(1, DAY_ONE, "dnslookup", "error", "journal.dnslookup.serversSaveFailed", {
    reason: "нет связи",
  });

  assert.equal(matchesFilters(item, filters({ query: "serversSaveFailed" })), true);
});

test("запрос находит запись по значению параметра", () => {
  const item = entry(1, DAY_ONE, "dnslookup", "info", "journal.dnslookup.started", {
    total: 1,
    servers: 1,
    note: "kf6hq",
  });

  assert.equal(matchesFilters(item, filters({ query: "kf6hq" })), true);
});

test("фильтр только ошибки оставляет отказы", () => {
  const cases: [JournalKind, boolean][] = [
    ["error", true],
    ["info", false],
    ["result", false],
  ];

  for (const [kind, expected] of cases) {
    const item = entry(1, DAY_ONE, "core", kind, "journal.settings.language", {
      language: "ru",
    });
    assert.equal(matchesFilters(item, filters({ onlyErrors: true })), expected, kind);
  }
});

test("фильтр по источнику оставляет выбранные", () => {
  const fromCore = entry(1, DAY_ONE, "core", "info", "journal.settings.language", {
    language: "ru",
  });
  const fromDns = entry(2, DAY_ONE, "dnslookup", "info", "journal.dnslookup.cleared");
  const selected = filters({ sources: ["dnslookup"] });

  assert.equal(matchesFilters(fromCore, selected), false);
  assert.equal(matchesFilters(fromDns, selected), true);
});

test("пустой список источников пропускает все", () => {
  const fromCore = entry(1, DAY_ONE, "core", "info", "journal.settings.language", {
    language: "ru",
  });
  const fromDns = entry(2, DAY_ONE, "dnslookup", "info", "journal.dnslookup.cleared");

  assert.equal(matchesFilters(fromCore, filters({ sources: [] })), true);
  assert.equal(matchesFilters(fromDns, filters({ sources: [] })), true);
});

test("порядок сначала старые переворачивает список", () => {
  const items = [
    entry(3, DAY_ONE, "core", "info", "journal.settings.language", { language: "ru" }),
    entry(2, DAY_ONE, "core", "info", "journal.settings.language", { language: "ru" }),
    entry(1, DAY_ONE, "core", "info", "journal.settings.language", { language: "ru" }),
  ];

  assert.deepEqual(
    orderEntries(items, "oldest").map((item) => item.id),
    [1, 2, 3],
  );
});

test("порядок сначала новые оставляет список как есть", () => {
  const items = [
    entry(3, DAY_ONE, "core", "info", "journal.settings.language", { language: "ru" }),
    entry(1, DAY_ONE, "core", "info", "journal.settings.language", { language: "ru" }),
  ];

  assert.deepEqual(
    orderEntries(items, "newest").map((item) => item.id),
    [3, 1],
  );
});

test("записи одного дня дают один заголовок", () => {
  const first = entry(2, DAY_ONE, "core", "info", "journal.settings.language", {
    language: "ru",
  });
  const second = entry(1, DAY_ONE, "core", "info", "journal.settings.language", {
    language: "ru",
  });

  assert.deepEqual(dayRows([first, second]), [
    { type: "day", dayKey: new Date(2026, 10, 18).getTime() },
    { type: "entry", entry: first },
    { type: "entry", entry: second },
  ]);
});

test("записи разных дней дают заголовок перед каждым днём", () => {
  const newer = entry(2, DAY_TWO, "core", "info", "journal.settings.language", {
    language: "ru",
  });
  const older = entry(1, DAY_ONE, "core", "info", "journal.settings.language", {
    language: "ru",
  });

  assert.deepEqual(dayRows([newer, older]), [
    { type: "day", dayKey: new Date(2026, 10, 19).getTime() },
    { type: "entry", entry: newer },
    { type: "day", dayKey: new Date(2026, 10, 18).getTime() },
    { type: "entry", entry: older },
  ]);
});

test("счётчик новых считает только подходящие записи", () => {
  const items = [
    entry(4, DAY_ONE, "dnslookup", "error", "journal.dnslookup.serversBrokenFile"),
    entry(3, DAY_ONE, "core", "info", "journal.settings.language", { language: "ru" }),
    entry(2, DAY_ONE, "core", "info", "journal.settings.language", { language: "ru" }),
    entry(1, DAY_ONE, "core", "info", "journal.settings.language", { language: "ru" }),
  ];

  assert.equal(countNewer(items, filters(), 2), 2);
  assert.equal(countNewer(items, filters({ onlyErrors: true }), 2), 1);
});

test("подсветка делит текст по совпадению без учёта регистра", () => {
  assert.deepEqual(highlightParts("Проверка запущена", "зап"), [
    { text: "Проверка ", match: false },
    { text: "зап", match: true },
    { text: "ущена", match: false },
  ]);
});

test("подсветка чередует части при нескольких совпадениях", () => {
  assert.deepEqual(highlightParts("да нет да", "да"), [
    { text: "да", match: true },
    { text: " нет ", match: false },
    { text: "да", match: true },
  ]);
});

test("подсветка без запроса не делит текст", () => {
  assert.deepEqual(highlightParts("Проверка запущена", "  "), [
    { text: "Проверка запущена", match: false },
  ]);
});

test("счётчики источников считают записи по источникам", () => {
  const items = [
    entry(1, DAY_ONE, "core", "info", "journal.settings.language", { language: "ru" }),
    entry(2, DAY_ONE, "dnslookup", "info", "journal.dnslookup.cleared"),
    entry(3, DAY_ONE, "dnslookup", "info", "journal.dnslookup.cleared"),
  ];

  assert.deepEqual(sourceCounts(items), [
    { source: "core", count: 1 },
    { source: "dnslookup", count: 2 },
  ]);
});

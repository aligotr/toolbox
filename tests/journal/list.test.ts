// Проверки списка журнала.
//
// Помощники списка чистые: отбор, порядок, дни, прирост и подсветка.
// Словарь ставится как в приложении: без него `journalText` вернул бы код,
// и поиск проверял бы не то, что видит человек.
//
// Ожидаемые значения - литералы, а не вывод проверяемого кода.

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
  type JournalOrder,
  type JournalRow,
  type TextPart,
} from "../../src/workbench/journal/journalList.ts";

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

/** Запись ядра: у большинства проверок различается только номер. */
function coreInfo(id: number, at: number = DAY_ONE): JournalEntry {
  return entry(id, at, "core", "info", "journal.settings.language", { language: "ru" });
}

/** Запись инструмента DNS. */
function dnsInfo(id: number, at: number = DAY_ONE): JournalEntry {
  return entry(id, at, "dnslookup", "info", "journal.dnslookup.cleared");
}

/** Условия показа без отбора. */
function filters(overrides: Partial<JournalFilters> = {}): JournalFilters {
  return { query: "", onlyErrors: false, sources: [], ...overrides };
}

/** Местная дата разделителя: год, месяц, день. */
function dayOf(row: JournalRow): [number, number, number] {
  const date = new Date(row.type === "day" ? row.dayKey : 0);
  return [date.getFullYear(), date.getMonth(), date.getDate()];
}

test("пустой запрос оставляет запись", () => {
  assert.equal(matchesFilters(coreInfo(1), filters()), true);
});

test("запрос без совпадений отбрасывает запись", () => {
  assert.equal(matchesFilters(coreInfo(1), filters({ query: "щщщ" })), false);
});

test("запрос находит запись по скрытому полю", () => {
  const byCode = entry(1, DAY_ONE, "dnslookup", "error", "journal.dnslookup.serversSaveFailed", {
    reason: "нет связи",
  });
  const byParam = entry(2, DAY_ONE, "dnslookup", "info", "journal.dnslookup.started", {
    total: 1,
    servers: 1,
    note: "kf6hq",
  });
  const cases: [JournalEntry, string][] = [
    [byCode, "serversSaveFailed"],
    [byParam, "kf6hq"],
  ];

  for (const [item, query] of cases) {
    assert.equal(matchesFilters(item, filters({ query })), true, query);
  }
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
    assert.equal(matchesFilters(item, filters({ onlyErrors: true })), expected, `вид ${kind}`);
  }
});

test("фильтр по источнику оставляет выбранные", () => {
  const selected = filters({ sources: ["dnslookup"] });

  assert.equal(matchesFilters(coreInfo(1), selected), false);
  assert.equal(matchesFilters(dnsInfo(2), selected), true);
});

test("пустой список источников пропускает все", () => {
  assert.equal(matchesFilters(coreInfo(1), filters({ sources: [] })), true);
  assert.equal(matchesFilters(dnsInfo(2), filters({ sources: [] })), true);
});

test("порядок переключает направление списка", () => {
  const items = [coreInfo(3), coreInfo(2), coreInfo(1)];
  const cases: [JournalOrder, number[]][] = [
    ["newest", [3, 2, 1]],
    ["oldest", [1, 2, 3]],
  ];

  for (const [order, expected] of cases) {
    assert.deepEqual(
      orderEntries(items, order).map((item) => item.id),
      expected,
      order,
    );
  }
});

test("записи одного дня дают один заголовок", () => {
  const rows = dayRows([coreInfo(2), coreInfo(1)]);

  assert.deepEqual(
    rows.map((row) => (row.type === "day" ? "day" : row.entry.id)),
    ["day", 2, 1],
  );
});

test("записи разных дней дают заголовок перед каждым днём", () => {
  const rows = dayRows([coreInfo(2, DAY_TWO), coreInfo(1, DAY_ONE)]);

  assert.deepEqual(
    rows.map((row) => (row.type === "day" ? "day" : row.entry.id)),
    ["day", 2, "day", 1],
  );
  assert.deepEqual(dayOf(rows[0]), [2026, 10, 19]);
  assert.deepEqual(dayOf(rows[2]), [2026, 10, 18]);
});

test("счётчик новых считает только подходящие записи", () => {
  const items = [
    entry(4, DAY_ONE, "dnslookup", "error", "journal.dnslookup.serversBrokenFile"),
    coreInfo(3),
    coreInfo(2),
    coreInfo(1),
  ];
  const cases: [JournalFilters, number][] = [
    [filters(), 2],
    [filters({ onlyErrors: true }), 1],
  ];

  for (const [filter, expected] of cases) {
    assert.equal(countNewer(items, filter, 2), expected, `только ошибки: ${filter.onlyErrors}`);
  }
});

test("подсветка делит текст по совпадениям", () => {
  const cases: [string, string, TextPart[]][] = [
    [
      "Проверка запущена",
      "зап",
      [
        { text: "Проверка ", match: false },
        { text: "зап", match: true },
        { text: "ущена", match: false },
      ],
    ],
    [
      "да нет да",
      "да",
      [
        { text: "да", match: true },
        { text: " нет ", match: false },
        { text: "да", match: true },
      ],
    ],
    ["Проверка запущена", "  ", [{ text: "Проверка запущена", match: false }]],
  ];

  for (const [text, query, expected] of cases) {
    assert.deepEqual(highlightParts(text, query), expected, `${text} / ${query}`);
  }
});

test("счётчики источников считают записи по источникам", () => {
  assert.deepEqual(sourceCounts([coreInfo(1), dnsInfo(2), dnsInfo(3)]), [
    { source: "core", count: 1 },
    { source: "dnslookup", count: 2 },
  ]);
});

// Проверки правил таблицы DNS: сравнение ответов, фильтры, перестановка.
//
// Правило отвечает на вопрос пользователя «совпадает ли ответ сервера
// с системным» и «что видно под фильтром». TTL, порядок, регистр
// и завершающая точка ответ не меняют, поэтому в ожиданиях их нет.

import assert from "node:assert/strict";
import test from "node:test";
import type { CellStatus, DnsCell, DnsSession, DnsRow } from "../../src/tools/dnslookup/types.ts";
import { buildVerdicts, cellsMatch, matchesStatus } from "../../src/tools/dnslookup/state/compare.ts";
import { moveRow, removeRow } from "../../src/tools/dnslookup/state/rows.ts";

/** Ячейка с ответом: статус и значения задаёт тест. */
function cellOf(status: CellStatus, values: string[] = [], ttl = 60): DnsCell {
  return {
    status,
    answers: values.map((value) => ({ value, ttl })),
    elapsedMs: 1,
    error: null,
  };
}

/** Строка таблицы: правилам сравнения нужен только идентификатор. */
function rowOf(id: string): DnsRow {
  return { id, input: id, name: id, type: "A" };
}

/** Сеанс с заданными строками, серверами и ячейками. */
function sessionOf(
  servers: string[],
  rows: string[],
  cells: Array<[string, DnsCell]> = [],
): DnsSession {
  return {
    rows: rows.map(rowOf),
    servers,
    cells: new Map(cells),
  } as unknown as DnsSession;
}

test("ответы совпадают без учёта порядка, регистра, точки и TTL", () => {
  const base = cellOf("ok", ["1.1.1.1", "2.2.2.2"], 60);
  const other = cellOf("ok", ["2.2.2.2.", "1.1.1.1"], 600);

  assert.equal(cellsMatch(base, other), true);
});

test("разный статус или набор значений — не совпадают", () => {
  assert.equal(cellsMatch(cellOf("ok", ["1.1.1.1"]), cellOf("nxdomain")), false);
  assert.equal(cellsMatch(cellOf("ok", ["1.1.1.1"]), cellOf("ok", ["2.2.2.2"])), false);
});

test("без системного сервера вердиктов нет", () => {
  const session = sessionOf(["yandex"], ["a"], [["a:yandex", cellOf("ok", ["1.1.1.1"])]]);

  assert.equal(buildVerdicts(session).size, 0);
});

test("совпадение с системным сервером даёт полный вердикт", () => {
  const session = sessionOf(
    ["system", "yandex"],
    ["a"],
    [
      ["a:system", cellOf("ok", ["1.1.1.1"])],
      ["a:yandex", cellOf("ok", ["1.1.1.1"])],
    ],
  );

  assert.deepEqual(buildVerdicts(session).get("a"), { matched: 1, total: 1, differs: false });
});

test("расхождение с системным сервером помечает строку", () => {
  const session = sessionOf(
    ["system", "yandex"],
    ["a"],
    [
      ["a:system", cellOf("ok", ["1.1.1.1"])],
      ["a:yandex", cellOf("ok", ["2.2.2.2"])],
    ],
  );

  assert.deepEqual(buildVerdicts(session).get("a"), { matched: 0, total: 1, differs: true });
});

test("незавершённая проверка откладывает вердикт", () => {
  const pending = sessionOf(
    ["system", "yandex"],
    ["a"],
    [
      ["a:system", cellOf("ok", ["1.1.1.1"])],
      ["a:yandex", cellOf("pending")],
    ],
  );
  const noBase = sessionOf(
    ["system", "yandex"],
    ["a"],
    [
      ["a:system", cellOf("pending")],
      ["a:yandex", cellOf("ok", ["1.1.1.1"])],
    ],
  );

  assert.equal(buildVerdicts(pending).size, 0);
  assert.equal(buildVerdicts(noBase).size, 0);
});

test("фильтр «все» пропускает строку без результатов", () => {
  assert.equal(matchesStatus(sessionOf(["system"], ["a"]), "a", "all"), true);
});

test("фильтр ошибок смотрит на статусы ячеек", () => {
  const failed = sessionOf(["system"], ["a"], [["a:system", cellOf("servfail")]]);
  const answered = sessionOf(["system"], ["a"], [["a:system", cellOf("ok", ["1.1.1.1"])]]);

  assert.equal(matchesStatus(failed, "a", "error"), true);
  assert.equal(matchesStatus(answered, "a", "error"), false);
});

test("фильтр «без ответа» ловит nxdomain и nodata", () => {
  const empty = sessionOf(["system"], ["a"], [["a:system", cellOf("nxdomain")]]);
  const failed = sessionOf(["system"], ["a"], [["a:system", cellOf("servfail")]]);

  assert.equal(matchesStatus(empty, "a", "empty"), true);
  assert.equal(matchesStatus(failed, "a", "empty"), false);
});

test("перестановка меняет места только видимых строк", () => {
  const session = sessionOf(["system"], ["a", "b", "c", "d"]);
  const visible = session.rows.filter((row) => row.id !== "b" && row.id !== "d");

  moveRow(session, visible, 0, 1);

  assert.deepEqual(
    session.rows.map((row) => row.id),
    ["c", "b", "a", "d"],
  );
});

test("перестановка на то же место ничего не меняет", () => {
  const session = sessionOf(["system"], ["a", "b", "c"]);

  moveRow(session, session.rows, 1, 1);

  assert.deepEqual(
    session.rows.map((row) => row.id),
    ["a", "b", "c"],
  );
});

test("удаление строки убирает её результаты и подсветку", () => {
  const session = sessionOf(
    ["system", "yandex"],
    ["a", "b"],
    [
      ["a:system", cellOf("ok", ["1.1.1.1"])],
      ["b:system", cellOf("ok", ["2.2.2.2"])],
    ],
  );
  session.highlightRowId = "a";

  removeRow(session, "a");

  assert.deepEqual(
    session.rows.map((row) => row.id),
    ["b"],
  );
  assert.deepEqual([...session.cells.keys()], ["b:system"]);
  assert.equal(session.highlightRowId, null);
});

// Проверки формата пресета DNS.
//
// Пресет хранит вход инструмента: строки, серверы, скрытые колонки и фильтры.
// Разбор снисходителен к прошлому, но строка, значение которой не подходит
// типу, в таблицу не попадает: имя пересобирается из ввода, а негодная строка
// отбрасывается.

import assert from "node:assert/strict";
import test from "node:test";
import { installBuiltin } from "../../src/core/infra/i18n/catalog.ts";
import { ruMessages } from "../../src/core/infra/i18n/messages.ts";
import {
  capturePresetPayload,
  parsePresetPayload,
} from "../../src/tools/dnslookup/presets/format.ts";
import type { DnsSession } from "../../src/tools/dnslookup/types.ts";

installBuiltin(ruMessages);

test("payload без строк и серверов не разбирается", () => {
  assert.equal(parsePresetPayload({ rows: [] }), null);
  assert.equal(parsePresetPayload(null), null);
  assert.equal(parsePresetPayload([]), null);
});

test("устаревшее имя строки пересобирается из ввода", () => {
  const parsed = parsePresetPayload({
    rows: [{ id: "r1", input: "Example.COM.", name: "0.1.225.209", type: "A" }],
    servers: ["system"],
  });

  assert.ok(parsed);
  assert.equal(parsed.droppedRows, 0);
  assert.equal(parsed.payload.rows[0]?.name, "example.com");
});

test("числовая метка не считается доменом", () => {
  const parsed = parsePresetPayload({
    rows: [
      { id: "r1", input: "12345", name: "12345", type: "A" },
      { id: "r2", input: "example.test", name: "example.test", type: "A" },
    ],
    servers: ["system"],
  });

  assert.ok(parsed);
  assert.deepEqual(
    parsed.payload.rows.map((row) => row.id),
    ["r2"],
  );
  assert.equal(parsed.droppedRows, 1);
});

test("строка с недопустимым для типа значением отбрасывается", () => {
  const parsed = parsePresetPayload({
    rows: [
      { id: "r1", input: "0.1.225.209", name: "0.1.225.209", type: "A" },
      { id: "r2", input: "example.test", name: "example.test", type: "A" },
    ],
    servers: ["system"],
  });

  assert.ok(parsed);
  assert.deepEqual(
    parsed.payload.rows.map((row) => row.id),
    ["r2"],
  );
  assert.equal(parsed.droppedRows, 1);
});

test("IP-адрес в пресете остаётся только в строке PTR", () => {
  const parsed = parsePresetPayload({
    rows: [{ id: "r1", input: "0.1.225.209", name: "0.1.225.209", type: "PTR" }],
    servers: ["system"],
  });

  assert.ok(parsed);
  assert.equal(parsed.payload.rows[0]?.type, "PTR");
});

test("неизвестные фильтры заменяются умолчаниями", () => {
  const parsed = parsePresetPayload({
    rows: [{ id: "r1", input: "example.test", name: "example.test", type: "A" }],
    servers: ["system"],
    filters: { search: 42, status: "weird", diffOnly: "yes" },
  });

  assert.deepEqual(parsed?.payload.filters, { search: "", status: "all", diffOnly: false });
});

test("снимок сеанса разбирается обратно без изменений", () => {
  const session = {
    rows: [{ id: "r1", input: "example.test", name: "example.test", type: "A" }],
    servers: ["system"],
    hiddenServers: [],
    filters: { search: "", status: "all", diffOnly: false },
  } as unknown as DnsSession;

  const snapshot = JSON.stringify(capturePresetPayload(session));
  const parsed = parsePresetPayload(JSON.parse(snapshot));

  assert.deepEqual(parsed?.payload, capturePresetPayload(session));
});

// Проверки формата пресета Ping.
//
// Пресет хранит вход инструмента: цели и параметры, но не пакеты.
// Разбор снисходителен: обязательны только цели, неизвестное поле
// заменяется умолчанием, неполная цель отбрасывается целиком.

import assert from "node:assert/strict";
import test from "node:test";
import { installBuiltin } from "../../src/core/infra/i18n/catalog.ts";
import { ruMessages } from "../../src/core/infra/i18n/messages.ts";
import type { IcmpSession } from "../../src/tools/icmp/types.ts";
import { icmpPresetBinding } from "../../src/tools/icmp/presets/binding.ts";
import { capturePresetPayload, parsePresetPayload } from "../../src/tools/icmp/presets/format.ts";

installBuiltin(ruMessages);

/** Сеанс с одной целью и нестандартными параметрами. */
function sessionOf(): IcmpSession {
  return {
    targets: [
      {
        id: "t1",
        input: "example.test",
        family: "ipv6",
        normalized: "example.test",
        addresses: [
          {
            ip: "2001:db8::1",
            family: "ipv6",
            scopeId: 0,
            expected: 4,
            cancelled: false,
            packets: [{ sequence: 1, status: "ok", rttMs: 5, ttl: null, atMs: 1, error: null }],
          },
        ],
        error: null,
        active: false,
        cancelled: false,
        failed: false,
      },
    ],
    family: "ipv4",
    periodMs: 500,
    count: 10,
    timeoutMs: 2000,
    filters: { search: "example", status: "ok", family: "ipv6" },
    status: { run: { loading: false, error: null } },
    progress: { targets: 1, addresses: 1, sent: 1, received: 1 },
    runId: null,
    highlightTargetId: null,
    presetId: null,
    presetTitle: null,
    presetSnapshot: null,
  };
}

test("payload без целей не разбирается", () => {
  assert.equal(parsePresetPayload({ family: "auto" }), null);
  assert.equal(parsePresetPayload(null), null);
  assert.equal(parsePresetPayload([]), null);
});

test("неполная цель отбрасывается, остальные загружаются", () => {
  const parsed = parsePresetPayload({
    targets: [
      { id: "t1", input: "a.test", family: "ipv4" },
      { id: "", input: "b.test" },
      { id: "t3", input: "   " },
      "not-an-object",
    ],
  });

  assert.ok(parsed);
  assert.equal(parsed.payload.targets.length, 1);
  assert.equal(parsed.droppedTargets, 3);
  assert.equal(parsed.payload.targets[0]?.input, "a.test");
});

test("неизвестное семейство цели заменяется умолчанием", () => {
  const parsed = parsePresetPayload({
    targets: [{ id: "t1", input: "a.test", family: "ipx" }],
  });

  assert.equal(parsed?.payload.targets[0]?.family, "auto");
});

test("повторяющийся id цели отбрасывается", () => {
  const parsed = parsePresetPayload({
    targets: [
      { id: "t1", input: "a.test" },
      { id: "t1", input: "b.test" },
      { id: "t2", input: "c.test" },
    ],
  });

  assert.ok(parsed);
  assert.deepEqual(
    parsed.payload.targets.map((target) => target.input),
    ["a.test", "c.test"],
  );
  assert.equal(parsed.droppedTargets, 1);
});

test("параметры вне пределов заменяются умолчаниями", () => {
  const parsed = parsePresetPayload({
    targets: [{ id: "t1", input: "a.test" }],
    periodMs: 10,
    count: 1000,
    timeoutMs: "fast",
  });

  assert.equal(parsed?.payload.periodMs, 1000);
  assert.equal(parsed?.payload.count, 4);
  assert.equal(parsed?.payload.timeoutMs, 1000);
});

test("неизвестные фильтры заменяются умолчаниями", () => {
  const parsed = parsePresetPayload({
    targets: [{ id: "t1", input: "a.test" }],
    filters: { search: 42, status: "weird", family: "ipx" },
  });

  assert.deepEqual(parsed?.payload.filters, { search: "", status: "all", family: "all" });
});

test("снимок сеанса не содержит результатов", () => {
  const payload = capturePresetPayload(sessionOf());

  assert.deepEqual(payload.targets, [{ id: "t1", input: "example.test", family: "ipv6" }]);
  assert.equal(payload.periodMs, 500);
  assert.equal(payload.count, 10);
  assert.equal(payload.timeoutMs, 2000);
  assert.equal("addresses" in (payload.targets[0] ?? {}), false);
});

test("снимок сеанса разбирается обратно без изменений", () => {
  const session = sessionOf();
  const snapshot = icmpPresetBinding.snapshotOf(session);

  assert.deepEqual(
    icmpPresetBinding.readSnapshot({ ...session, presetSnapshot: snapshot }),
    capturePresetPayload(session),
  );
});

test("испорченный снимок не роняет откат", () => {
  assert.equal(
    icmpPresetBinding.readSnapshot({ ...sessionOf(), presetSnapshot: "{не json" }),
    null,
  );
});

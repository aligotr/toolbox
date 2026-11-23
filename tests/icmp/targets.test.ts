// Проверки списка целей Ping: добавление, дубликаты, фильтры, перестановка.
//
// Список - это вход инструмента, а не результат: добавление не запускает
// проверку. Дубликат не создаёт вторую строку, а подсвечивает первую;
// фильтр не переставляет скрытые цели.

import assert from "node:assert/strict";
import test from "node:test";
import { installBuiltin } from "../../src/core/infra/i18n/catalog.ts";
import { ruMessages } from "../../src/core/infra/i18n/messages.ts";
import type { IcmpAddress, IcmpSession, IcmpTarget } from "../../src/tools/icmp/types.ts";
import {
  addTarget,
  clearSession,
  filterTargets,
  moveTarget,
  removeTarget,
} from "../../src/tools/icmp/state/targets.ts";

installBuiltin(ruMessages);

/** Адрес цели с пакетами; статус цели считается по ним. */
function addressOf(ip: string, answered: boolean): IcmpAddress {
  return {
    ip,
    family: "ipv4",
    scopeId: 0,
    expected: 1,
    cancelled: false,
    packets: [
      {
        sequence: 1,
        status: answered ? "ok" : "timeout",
        rttMs: answered ? 5 : null,
        ttl: answered ? 64 : null,
        atMs: 0,
        error: null,
      },
    ],
  };
}

/** Цель с готовым результатом. */
function targetOf(id: string, input: string, answered: boolean): IcmpTarget {
  return {
    id,
    input,
    family: "auto",
    normalized: null,
    addresses: [addressOf("192.0.2.1", answered)],
    error: null,
    active: false,
    cancelled: false,
    failed: false,
  };
}

/** Пустой сеанс с заданными целями. */
function sessionOf(targets: IcmpTarget[] = []): IcmpSession {
  return {
    targets,
    family: "auto",
    periodMs: 1000,
    count: 4,
    timeoutMs: 1000,
    filters: { search: "", status: "all", family: "all" },
    status: { run: { loading: false, error: null } },
    progress: { targets: 0, addresses: 0, sent: 0, received: 0 },
    runId: null,
    highlightTargetId: null,
    presetId: null,
    presetTitle: null,
    presetSnapshot: null,
  };
}

test("новая цель встаёт в начало списка", () => {
  const session = sessionOf();

  const result = addTarget(session, "example.test", "auto");

  assert.equal(result.kind, "added");
  assert.equal(session.targets.length, 1);
  assert.equal(session.targets[0]?.input, "example.test");
});

test("пустая цель не добавляется", () => {
  const session = sessionOf();

  const result = addTarget(session, "   ", "auto");

  assert.equal(result.kind, "error");
  assert.equal(session.targets.length, 0);
});

test("дубликат не создаёт вторую строку", () => {
  const session = sessionOf();
  const first = addTarget(session, "Example.Test", "auto");
  assert.equal(first.kind, "added");

  const second = addTarget(session, " example.test ", "auto");

  assert.equal(second.kind, "duplicate");
  assert.equal(session.targets.length, 1);
  assert.equal(second.kind === "duplicate" ? second.targetId : "", session.targets[0]?.id);
});

test("одно имя с разными семействами - разные цели", () => {
  const session = sessionOf();
  addTarget(session, "example.test", "auto");

  const result = addTarget(session, "example.test", "ipv4");

  assert.equal(result.kind, "added");
  assert.equal(session.targets.length, 2);
});

test("удаление убирает цель вместе с результатами", () => {
  const session = sessionOf([targetOf("t1", "a.test", true), targetOf("t2", "b.test", true)]);

  removeTarget(session, "t1");

  assert.deepEqual(
    session.targets.map((target) => target.id),
    ["t2"],
  );
});

test("поиск смотрит и на нормализованное имя", () => {
  const session = sessionOf([targetOf("t1", "пример.рф", true)]);
  session.targets[0]!.normalized = "xn--e1afmkfd.xn--p1ai";

  session.filters.search = "xn--";
  assert.equal(filterTargets(session).length, 1);

  session.filters.search = "missing";
  assert.equal(filterTargets(session).length, 0);
});

test("фильтр статуса отличает ответившие цели", () => {
  const session = sessionOf([targetOf("t1", "a.test", true), targetOf("t2", "b.test", false)]);

  session.filters.status = "ok";
  assert.deepEqual(
    filterTargets(session).map((target) => target.id),
    ["t1"],
  );

  session.filters.status = "failed";
  assert.deepEqual(
    filterTargets(session).map((target) => target.id),
    ["t2"],
  );
});

test("перестановка не трогает скрытые фильтром цели", () => {
  const session = sessionOf([
    targetOf("a", "a.test", true),
    targetOf("b", "b.test", true),
    targetOf("c", "c.test", true),
  ]);

  moveTarget(session, [session.targets[0]!, session.targets[2]!], 0, 1);

  assert.deepEqual(
    session.targets.map((target) => target.id),
    ["c", "b", "a"],
  );
});

test("очистка сбрасывает цели, фильтры и прогресс", async () => {
  const session = sessionOf([targetOf("t1", "a.test", true)]);
  session.filters.search = "a";
  session.progress = { targets: 1, addresses: 1, sent: 1, received: 1 };

  await clearSession(session);

  assert.equal(session.targets.length, 0);
  assert.equal(session.filters.search, "");
  assert.equal(session.progress.sent, 0);
});

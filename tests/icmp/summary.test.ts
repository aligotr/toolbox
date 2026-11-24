// Проверки сводки Ping: потери, задержки, статусы цели и адреса.
//
// Сводка - это ответ на вопросы «отвечает ли узел», «сколько теряется»
// и «как быстро». Правила общие для таблицы и фильтра, поэтому
// проверяются без Vue и без сети.

import assert from "node:assert/strict";
import test from "node:test";
import type {
  IcmpAddress,
  IcmpTarget,
  PacketRecord,
  SeriesStatus,
} from "../../src/tools/icmp/types.ts";
import {
  addressCaption,
  addressStats,
  addressStatus,
  matchesFamily,
  matchesStatus,
  recordPacket,
  statsOf,
  targetStats,
  targetStatus,
  totalsOf,
} from "../../src/tools/icmp/summary.ts";

/** Пакет с заданным статусом и задержкой. */
function packet(
  status: PacketRecord["status"],
  rttMs: number | null = null,
  atMs = 0,
  sequence = 1,
): PacketRecord {
  return { sequence, status, rttMs, ttl: 64, atMs, error: null };
}

/** Адрес с пакетами; число ожидаемых пакетов задаёт тест. */
function addressOf(
  ip: string,
  packets: PacketRecord[],
  family: IcmpAddress["family"] = "ipv4",
  extra: Partial<IcmpAddress> = {},
): IcmpAddress {
  return {
    ip,
    family,
    scopeId: 0,
    expected: packets.length,
    cancelled: false,
    totals: totalsOf(packets),
    packets,
    ...extra,
  };
}

/** Цель с адресами; ошибка разрешения задаётся отдельно. */
function targetOf(
  addresses: IcmpAddress[],
  error: string | null = null,
  extra: Partial<IcmpTarget> = {},
): IcmpTarget {
  return {
    id: "t1",
    input: "example.test",
    family: "auto",
    normalized: null,
    addresses,
    error,
    active: false,
    cancelled: false,
    failed: false,
    ...extra,
  };
}

test("пустая серия не даёт ни потерь, ни задержек", () => {
  assert.deepEqual(statsOf([]), {
    sent: 0,
    received: 0,
    loss: null,
    min: null,
    avg: null,
    max: null,
    last: null,
  });
});

test("потери считаются по отправленным пакетам", () => {
  const stats = statsOf([packet("ok", 10), packet("timeout"), packet("ok", 30)]);

  assert.equal(stats.sent, 3);
  assert.equal(stats.received, 2);
  assert.equal(stats.loss, 33);
  assert.equal(stats.min, 10);
  assert.equal(stats.max, 30);
  assert.equal(stats.avg, 20);
  assert.equal(stats.last, 30);
});

test("последняя задержка - последний успешный пакет, а не последний вообще", () => {
  const stats = statsOf([packet("ok", 5), packet("timeout"), packet("ok", 7)]);

  assert.equal(stats.last, 7);
});

test("последняя задержка выбирается по времени, а не по порядку адресов", () => {
  const target = targetOf([
    addressOf("192.0.2.1", [packet("ok", 40, 200, 2)]),
    addressOf("2001:db8::1", [packet("ok", 10, 100, 1)], "ipv6"),
  ]);

  assert.equal(targetStats(target).last, 40);
});

test("недоступность не зависит от порядка пакетов", () => {
  const target = targetOf([
    addressOf("192.0.2.1", [packet("unreachable", null, 100, 1)]),
    addressOf("2001:db8::1", [packet("timeout", null, 200, 2)], "ipv6"),
  ]);

  assert.equal(targetStatus(target, false), "unreachable");
});

test("недоступность и ошибка тоже считаются потерями", () => {
  const stats = statsOf([packet("unreachable"), packet("error")]);

  assert.equal(stats.received, 0);
  assert.equal(stats.loss, 100);
  assert.equal(stats.avg, null);
});

test("завершённая серия без ответов - таймаут", () => {
  assert.equal(
    targetStatus(targetOf([addressOf("192.0.2.1", [packet("timeout")])]), false),
    "timeout",
  );
});

test("частичные ответы дают статус потерь", () => {
  const target = targetOf([addressOf("192.0.2.1", [packet("ok", 3), packet("timeout")])]);

  assert.equal(targetStatus(target, false), "loss");
});

test("идущая серия без потерь остаётся ожиданием", () => {
  const address = addressOf("192.0.2.1", [packet("ok", 3)], "ipv4", { expected: 4 });

  assert.equal(addressStatus(address, true), "pending");
});

test("первая потеря видна сразу, не дожидаясь конца серии", () => {
  const address = addressOf("192.0.2.1", [packet("ok", 3), packet("timeout")], "ipv4", {
    expected: 4,
  });

  assert.equal(addressStatus(address, true), "loss");
});

test("неразрешённое имя важнее пустой серии", () => {
  assert.equal(targetStatus(targetOf([], "нет адресов"), false), "unresolved");
});

test("новая цель ждёт и не считается неразрешённой", () => {
  assert.equal(targetStatus(targetOf([]), false), "pending");
});

test("отказ прогона важнее пустой серии", () => {
  assert.equal(targetStatus(targetOf([], null, { failed: true }), false), "error");
});

test("отмена до разрешения целей даёт отмену, а не ожидание", () => {
  assert.equal(targetStatus(targetOf([], null, { cancelled: true }), false), "cancelled");
});

test("цель без адресов во время проверки ждёт", () => {
  assert.equal(targetStatus(targetOf([]), true), "pending");
});

test("отмена обрывает недосчитанную серию", () => {
  const address = addressOf("192.0.2.1", [packet("ok", 3)], "ipv4", {
    expected: 4,
    cancelled: true,
  });

  assert.equal(addressStatus(address, false), "cancelled");
});

test("отказ вызова важнее отмены", () => {
  const address = addressOf("192.0.2.1", [packet("error")], "ipv4", {
    expected: 4,
    cancelled: true,
  });

  assert.equal(addressStatus(address, false), "error");
});

test("статус цели собирается по всем адресам", () => {
  const target = targetOf([
    addressOf("192.0.2.1", [packet("ok", 4), packet("ok", 6)]),
    addressOf("2001:db8::1", [packet("ok", 8), packet("ok", 10)], "ipv6"),
  ]);

  const stats = targetStats(target);
  assert.equal(stats.sent, 4);
  assert.equal(stats.received, 4);
  assert.equal(stats.avg, 7);
  assert.equal(targetStatus(target, false), "ok");
});

test("фильтр статуса отличает потери от полного отказа", () => {
  const statuses: SeriesStatus[] = ["ok", "loss", "timeout", "unresolved", "error", "cancelled"];

  assert.deepEqual(
    statuses.filter((status) => matchesStatus(status, "ok")),
    ["ok"],
  );
  assert.deepEqual(
    statuses.filter((status) => matchesStatus(status, "loss")),
    ["loss"],
  );
  assert.deepEqual(
    statuses.filter((status) => matchesStatus(status, "failed")),
    ["timeout", "unresolved", "error", "cancelled"],
  );
  assert.equal(matchesStatus("timeout", "all"), true);
});

test("фильтр семейства смотрит на адреса цели", () => {
  const target = targetOf([addressOf("2001:db8::1", [packet("ok", 1)], "ipv6")]);

  assert.equal(matchesFamily(target, "all"), true);
  assert.equal(matchesFamily(target, "ipv6"), true);
  assert.equal(matchesFamily(target, "ipv4"), false);
});

test("адрес link-local показывается со scope id", () => {
  assert.equal(addressCaption({ ip: "fe80::1", scopeId: 12 }), "fe80::1%12");
  assert.equal(addressCaption({ ip: "192.0.2.1", scopeId: 0 }), "192.0.2.1");
});

test("вытесненные пакеты не искажают счётчики адреса", () => {
  const kept = [packet("ok", 10, 300, 3)];
  const address = addressOf("192.0.2.1", kept, "ipv4", {
    expected: 3,
    totals: totalsOf([packet("ok", 5, 100, 1), packet("timeout", null, 200, 2), kept[0]!]),
  });

  const stats = addressStats(address);
  assert.equal(stats.sent, 3);
  assert.equal(stats.received, 2);
  assert.equal(stats.loss, 33);
  assert.equal(stats.avg, 7.5);
  assert.equal(address.packets.length, 1);
});

test("бесконечная серия показывает результат сразу", () => {
  const address = addressOf("192.0.2.1", [packet("ok", 3)], "ipv4", { expected: null });

  assert.equal(addressStatus(address, true), "ok");
});

test("остановка бесконечной серии даёт отмену", () => {
  const address = addressOf("192.0.2.1", [packet("ok", 3)], "ipv4", {
    expected: null,
    cancelled: true,
  });

  assert.equal(addressStatus(address, false), "cancelled");
});

test("раскрытие хранит последние пакеты, итог не теряется", () => {
  const address = addressOf("192.0.2.1", [], "ipv4", { expected: null });
  for (let sequence = 1; sequence <= 12; sequence += 1) {
    recordPacket(address, packet("ok", sequence, sequence, sequence), 10);
  }

  assert.equal(address.packets.length, 10);
  assert.equal(address.packets[0]?.sequence, 3);
  assert.equal(address.totals.sent, 12);
  assert.equal(addressStats(address).received, 12);
});

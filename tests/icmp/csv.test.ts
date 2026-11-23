// Проверки выгрузки Ping в CSV.
//
// Выгрузка отвечает на вопросы «как дела у адресов» и «что было с каждым
// пакетом». Проверяется то, что важно таблице: разделитель, BOM для Excel,
// строка на адрес и строка на пакет, пустые ячейки вместо прочерков.

import assert from "node:assert/strict";
import test from "node:test";
import { installBuiltin } from "../../src/core/infra/i18n/catalog.ts";
import { ruMessages } from "../../src/core/infra/i18n/messages.ts";
import type {
  IcmpAddress,
  IcmpSession,
  IcmpTarget,
  PacketRecord,
} from "../../src/tools/icmp/types.ts";
import { buildPacketsCsv, buildSummaryCsv } from "../../src/tools/icmp/state/csv.ts";

installBuiltin(ruMessages);

/** Пакет с заданным статусом и задержкой. */
function packet(
  sequence: number,
  status: PacketRecord["status"],
  rttMs: number | null = null,
  atMs = Date.UTC(2026, 10, 23, 12, 0, sequence),
): PacketRecord {
  return { sequence, status, rttMs, ttl: status === "ok" ? 64 : null, atMs, error: null };
}

/** Адрес с пакетами. */
function addressOf(
  ip: string,
  packets: PacketRecord[],
  family: IcmpAddress["family"] = "ipv4",
): IcmpAddress {
  return { ip, family, scopeId: 0, expected: packets.length, cancelled: false, packets };
}

/** Цель проверки. */
function targetOf(id: string, addresses: IcmpAddress[], error: string | null = null): IcmpTarget {
  return {
    id,
    input: `host-${id}.test`,
    family: "auto",
    normalized: null,
    addresses,
    error,
    active: false,
    cancelled: false,
    failed: false,
  };
}

/** Сеанс с заданными целями; проверка завершена. */
function sessionOf(targets: IcmpTarget[]): IcmpSession {
  return {
    targets,
    status: { run: { loading: false, error: null } },
  } as unknown as IcmpSession;
}

/** Строки CSV без заголовка. */
function dataLines(csv: string): string[] {
  return csv
    .replace(/^\uFEFF/, "")
    .split("\r\n")
    .slice(1);
}

test("сводка начинается с BOM и разделена точкой с запятой", () => {
  const target = targetOf("a", [addressOf("192.0.2.1", [packet(1, "ok", 10)])]);
  const csv = buildSummaryCsv(sessionOf([target]), [target]);

  assert.equal(csv.startsWith("\uFEFF"), true);
  assert.match(csv, /"Цель";"Адрес"/);
  assert.equal(csv.includes("\r\n"), true);
});

test("сводка даёт строку на каждый адрес", () => {
  const target = targetOf("a", [
    addressOf("192.0.2.1", [packet(1, "ok", 10), packet(2, "timeout")]),
    addressOf("2001:db8::1", [packet(1, "ok", 20)], "ipv6"),
  ]);

  assert.equal(dataLines(buildSummaryCsv(sessionOf([target]), [target])).length, 2);
});

test("неразрешённая цель даёт одну строку без адреса", () => {
  const target = targetOf("a", [], "не разрешено");
  const [line] = dataLines(buildSummaryCsv(sessionOf([target]), [target]));

  assert.equal(line, '"host-a.test";"";"";"0";"0";"";"";"";"";"";"Не разрешён"');
});

test("сводка считает потери и задержки по адресу", () => {
  const target = targetOf("a", [
    addressOf("192.0.2.1", [packet(1, "ok", 10), packet(2, "timeout"), packet(3, "ok", 30)]),
  ]);
  const [line] = dataLines(buildSummaryCsv(sessionOf([target]), [target]));

  // Цель, адрес, семейство, отправлено, получено, потери, мин, средн, макс, последний.
  assert.equal(line, '"host-a.test";"192.0.2.1";"IPv4";"3";"2";"33";"10";"20";"30";"30";"Потери"');
});

test("пакеты выгружаются строкой на отправленный пакет", () => {
  const target = targetOf("a", [
    addressOf("192.0.2.1", [packet(1, "ok", 10), packet(2, "unreachable")]),
    addressOf("2001:db8::1", [packet(1, "ok", 20)], "ipv6"),
  ]);

  assert.equal(dataLines(buildPacketsCsv([target])).length, 3);
});

test("пустая задержка и TTL остаются пустыми ячейками", () => {
  const target = targetOf("a", [addressOf("192.0.2.1", [packet(1, "timeout")])]);
  const [line] = dataLines(buildPacketsCsv([target]));
  const fields = line.split(";");

  // Цель, адрес, семейство, номер, статус, задержка, TTL, время.
  assert.equal(fields.slice(0, 5).join(";"), '"host-a.test";"192.0.2.1";"IPv4";"1";"Нет ответа"');
  assert.equal(fields[5], '""');
  assert.equal(fields[6], '""');
  assert.notEqual(fields[7], '""');
});

test("кавычки и точка с запятой не рвут строку", () => {
  const target = targetOf("a", [addressOf("192.0.2.1", [packet(1, "ok", 10)])]);
  target.input = 'host";evil.test';

  const [line] = dataLines(buildSummaryCsv(sessionOf([target]), [target]));

  assert.equal(line.startsWith('"host"";evil.test";'), true);
});

test("поле с формулой не выполняется при открытии таблицы", () => {
  const target = targetOf("a", [addressOf("192.0.2.1", [packet(1, "ok", 10)])]);
  target.input = "=1+1";

  const [line] = dataLines(buildSummaryCsv(sessionOf([target]), [target]));

  assert.equal(line.startsWith('"\'=1+1";'), true);
});

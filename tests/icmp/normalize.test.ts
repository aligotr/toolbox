// Проверки ввода цели Ping.
//
// Проверка стоит между пользователем и ядром: она решает, появится ли строка
// в таблице, и повторяет правила Rust, но раньше и у поля. Отказ - код
// словаря, поэтому ожидаемые значения здесь коды, а не текст.

import assert from "node:assert/strict";
import test from "node:test";
import { parseTargetInput } from "../../src/tools/icmp/normalize.ts";

test("домен принимается как есть", () => {
  for (const input of ["example.test", " example.test ", "example.test.", "localhost"]) {
    assert.deepEqual(parseTargetInput(input), { ok: true });
  }
});

test("IDN принимается: перевод в punycode делает URL-парсер", () => {
  assert.deepEqual(parseTargetInput("пример.рф"), { ok: true });
});

test("пустая цель - отказ emptyTarget", () => {
  for (const input of ["", "   "]) {
    assert.deepEqual(parseTargetInput(input), {
      ok: false,
      code: "common.hostEmpty",
      params: {},
    });
  }
});

test("мусор вместо имени - отказ badTarget", () => {
  for (const input of ["!!!", "a..b", "a$b.com", "exa mple.com", "*.example.com"]) {
    assert.deepEqual(parseTargetInput(input), {
      ok: false,
      code: "icmp.validate.badTarget",
      params: {},
    });
  }
});

test("имя с путём или логином - отказ badTarget", () => {
  for (const input of ["example.test/path", "user@example.test", "example.test?q=1"]) {
    assert.deepEqual(parseTargetInput(input), {
      ok: false,
      code: "icmp.validate.badTarget",
      params: {},
    });
  }
});

test("длинная метка и длинное имя - отказ badTarget", () => {
  const longLabel = `${"a".repeat(64)}.test`;
  const longName = ["a".repeat(63), "b".repeat(63), "c".repeat(63), "d".repeat(63)].join(".");

  for (const input of [longLabel, longName]) {
    assert.deepEqual(parseTargetInput(input), {
      ok: false,
      code: "icmp.validate.badTarget",
      params: {},
    });
  }
});

test("IPv4 принимается, испорченный - нет", () => {
  assert.deepEqual(parseTargetInput("192.0.2.7"), { ok: true });
  for (const input of ["999.1.1.1", "192.0.2.7%3"]) {
    assert.deepEqual(parseTargetInput(input), {
      ok: false,
      code: "icmp.validate.badTarget",
      params: {},
    });
  }
});

test("IPv6 принимается в скобках и со scope id", () => {
  for (const input of ["2001:db8::1", "[2001:db8::1]", "fe80::1%12", "[fe80::1%7]"]) {
    assert.deepEqual(parseTargetInput(input), { ok: true });
  }
});

test("испорченный IPv6 и нечисловой scope id - отказ badTarget", () => {
  for (const input of ["2001:db8:::1", "fe80::1%eth0", "[2001:db8::1]:80"]) {
    assert.deepEqual(parseTargetInput(input), {
      ok: false,
      code: "icmp.validate.badTarget",
      params: {},
    });
  }
});

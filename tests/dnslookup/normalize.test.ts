// Проверки нормализации ввода DNS.
//
// Проверка стоит между пользователем и ядром: она решает, уйдёт ли запрос,
// и повторяет правила Rust, но раньше и у поля. Отказ — код словаря
// и данные, поэтому ожидаемые значения здесь коды и канон, а не текст.

import assert from "node:assert/strict";
import test from "node:test";
import { parseAddressInput, parseServerAddress } from "../../src/tools/dnslookup/normalize.ts";

test("домен приводится к запросу, показ остаётся пользовательским", () => {
  assert.deepEqual(parseAddressInput("Example.COM.", "A"), {
    ok: true,
    value: { name: "example.com", display: "Example.COM" },
  });
});

test("IDN переводится в punycode", () => {
  const result = parseAddressInput("президент.рф", "A");

  assert.deepEqual(result, {
    ok: true,
    value: {
      name: "xn--d1abbgf6aiiy.xn--p1ai",
      display: "президент.рф",
    },
  });
});

test("пустой ввод — отказ emptyAddress", () => {
  for (const input of ["", "   "]) {
    assert.deepEqual(parseAddressInput(input, "A"), {
      ok: false,
      code: "common.hostEmpty",
      params: {},
    });
  }
});

test("IP допустим только для PTR", () => {
  assert.deepEqual(parseAddressInput("1.1.1.1", "A"), {
    ok: false,
    code: "dnslookup.validate.ipPtrOnly",
    params: {},
  });
  assert.deepEqual(parseAddressInput("1.1.1.1", "PTR"), {
    ok: true,
    value: { name: "1.1.1.1", display: "1.1.1.1" },
  });
});

test("сокращённый и числовой адрес - тоже IP, а не имя", () => {
  for (const input of ["127.1", "12345", "0x7f.1"]) {
    assert.deepEqual(parseAddressInput(input, "A"), {
      ok: false,
      code: "dnslookup.validate.ipPtrOnly",
      params: {},
    });
  }
});

test("PTR принимает только reverse-зону", () => {
  assert.deepEqual(parseAddressInput("example.com", "PTR"), {
    ok: false,
    code: "dnslookup.validate.ptrZone",
    params: {},
  });
  assert.deepEqual(parseAddressInput("1.0.0.127.in-addr.arpa", "PTR"), {
    ok: true,
    value: { name: "1.0.0.127.in-addr.arpa", display: "1.0.0.127.in-addr.arpa" },
  });
});

test("маска принимается, голый символ маски — нет", () => {
  assert.deepEqual(parseAddressInput("*.example.com", "A"), {
    ok: true,
    value: { name: "*.example.com", display: "*.example.com" },
  });
  assert.deepEqual(parseAddressInput("*", "A"), {
    ok: false,
    code: "dnslookup.validate.badChar",
    params: { label: "*" },
  });
});

test("пустая метка — отказ emptyLabel", () => {
  assert.deepEqual(parseAddressInput("a..b", "A"), {
    ok: false,
    code: "dnslookup.validate.emptyLabel",
    params: {},
  });
});

test("недопустимый символ в метке — отказ badChar", () => {
  assert.deepEqual(parseAddressInput("a$b.com", "A"), {
    ok: false,
    code: "dnslookup.validate.badChar",
    params: { label: "a$b" },
  });
});

test("мусор вместо имени - отказ badChar", () => {
  assert.deepEqual(parseAddressInput("!!!", "A"), {
    ok: false,
    code: "dnslookup.validate.badChar",
    params: { label: "!!!" },
  });
});

test("имя без разбора — отказ badName", () => {
  assert.deepEqual(parseAddressInput("exa mple.com", "A"), {
    ok: false,
    code: "dnslookup.validate.badName",
    params: { name: "exa mple.com" },
  });
});

test("длинная метка — отказ labelTooLong", () => {
  const label = "a".repeat(64);

  assert.deepEqual(parseAddressInput(`${label}.com`, "A"), {
    ok: false,
    code: "dnslookup.validate.labelTooLong",
    params: { label, limit: 63 },
  });
});

test("длинное имя — отказ nameTooLong", () => {
  const name = ["a".repeat(63), "b".repeat(63), "c".repeat(63), "d".repeat(63)].join(".");

  assert.deepEqual(parseAddressInput(name, "A"), {
    ok: false,
    code: "dnslookup.validate.nameTooLong",
    params: { limit: 253 },
  });
});

test("адрес сервера получает явный порт по умолчанию", () => {
  assert.deepEqual(parseServerAddress("1.1.1.1"), { ok: true, address: "1.1.1.1:53" });
  assert.deepEqual(parseServerAddress("1.1.1.1:5353"), {
    ok: true,
    address: "1.1.1.1:5353",
  });
});

test("IPv6 принимается в скобках и без них", () => {
  assert.deepEqual(parseServerAddress("[2001:db8::1]"), {
    ok: true,
    address: "[2001:db8::1]:53",
  });
  assert.deepEqual(parseServerAddress("[2001:db8::1]:5353"), {
    ok: true,
    address: "[2001:db8::1]:5353",
  });
  assert.deepEqual(parseServerAddress("2001:db8::1"), {
    ok: true,
    address: "[2001:db8::1]:53",
  });
});

test("порт вне диапазона — отказ", () => {
  assert.deepEqual(parseServerAddress("[2001:db8::1]:0"), {
    ok: false,
    code: "dnslookup.validate.badPort",
    params: { address: "[2001:db8::1]:0" },
  });
  assert.deepEqual(parseServerAddress("1.1.1.1:65536"), {
    ok: false,
    code: "dnslookup.validate.badServer",
    params: { address: "1.1.1.1:65536" },
  });
});

test("не адрес сервера — отказ badServer", () => {
  for (const input of ["ns.example.com", "1.1.1.1:", "1.1.1.1:abc"]) {
    assert.deepEqual(parseServerAddress(input), {
      ok: false,
      code: "dnslookup.validate.badServer",
      params: { address: input },
    });
  }
});

test("испорченный IPv6 — отказ badIpv6", () => {
  assert.deepEqual(parseServerAddress("[2001:db8:::1]"), {
    ok: false,
    code: "dnslookup.validate.badIpv6",
    params: { address: "2001:db8:::1" },
  });
});

test("пустой адрес сервера — отказ serverEmpty", () => {
  assert.deepEqual(parseServerAddress("  "), {
    ok: false,
    code: "dnslookup.validate.serverEmpty",
    params: {},
  });
});

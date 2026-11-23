// Проверки разбора координаты окна из поля настроек.
//
// Разбор стоит до команды: ядро принимает только целое число в диапазоне
// `i32` и не сообщает, какое поле не подошло. Поэтому неверный ввод должен
// отсекаться здесь и подсвечивать своё поле.

import assert from "node:assert/strict";
import test from "node:test";
import { parseCoordinate } from "../../src/workbench/settings/parseCoordinate.ts";

test("целое число становится координатой", () => {
  assert.deepEqual(parseCoordinate("100"), { value: 100 });
  assert.deepEqual(parseCoordinate(" -7 "), { value: -7 });
});

test("пустое поле координаты не даёт", () => {
  assert.deepEqual(parseCoordinate(""), { problem: "invalid" });
  assert.deepEqual(parseCoordinate("   "), { problem: "invalid" });
});

test("дробное число не считается координатой", () => {
  assert.deepEqual(parseCoordinate("1.5"), { problem: "invalid" });
});

test("посторонний текст не считается координатой", () => {
  assert.deepEqual(parseCoordinate("слева"), { problem: "invalid" });
  assert.deepEqual(parseCoordinate("12px"), { problem: "invalid" });
});

test("значение за границей i32 отвергается", () => {
  assert.deepEqual(parseCoordinate("2147483647"), { value: 2147483647 });
  assert.deepEqual(parseCoordinate("-2147483648"), { value: -2147483648 });
  assert.deepEqual(parseCoordinate("2147483648"), { problem: "range" });
  assert.deepEqual(parseCoordinate("-2147483649"), { problem: "range" });
});

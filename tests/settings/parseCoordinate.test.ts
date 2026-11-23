// Проверки разбора чисел окна из полей настроек.
//
// Разбор стоит до команды: ядро принимает только целые числа и не сообщает,
// какое поле не подошло. Поэтому неверный ввод должен отсекаться здесь
// и подсвечивать своё поле.

import assert from "node:assert/strict";
import test from "node:test";
import { parseCoordinate, parseSize } from "../../src/workbench/settings/parseCoordinate.ts";

test("целое число становится координатой", () => {
  assert.deepEqual(parseCoordinate("100"), { value: 100 });
  assert.deepEqual(parseCoordinate(" -7 "), { value: -7 });
});

test("пустое поле координаты отделяется от неверного ввода", () => {
  assert.deepEqual(parseCoordinate(""), { problem: "empty" });
  assert.deepEqual(parseCoordinate("   "), { problem: "empty" });
});

test("дробное число не считается координатой", () => {
  assert.deepEqual(parseCoordinate("1.5"), { problem: "invalid" });
});

test("посторонний текст не считается координатой", () => {
  assert.deepEqual(parseCoordinate("слева"), { problem: "invalid" });
  assert.deepEqual(parseCoordinate("12px"), { problem: "invalid" });
});

test("координата на границе i32 и за ней", () => {
  assert.deepEqual(parseCoordinate("2147483647"), { value: 2147483647 });
  assert.deepEqual(parseCoordinate("-2147483648"), { value: -2147483648 });
  assert.deepEqual(parseCoordinate("2147483648"), { problem: "range" });
  assert.deepEqual(parseCoordinate("-2147483649"), { problem: "range" });
});

test("размер не меньше минимального", () => {
  assert.deepEqual(parseSize("960", 960), { value: 960 });
  assert.deepEqual(parseSize("640", 640), { value: 640 });
  assert.deepEqual(parseSize("959", 960), { problem: "range" });
});

test("размер на границе u32 и за ней", () => {
  assert.deepEqual(parseSize("4294967295", 960), { value: 4294967295 });
  assert.deepEqual(parseSize("4294967296", 960), { problem: "range" });
});

test("пустой размер отвергается", () => {
  assert.deepEqual(parseSize("", 960), { problem: "empty" });
});

test("нецелый размер отвергается", () => {
  assert.deepEqual(parseSize("1200.5", 960), { problem: "invalid" });
  assert.deepEqual(parseSize("широкое", 960), { problem: "invalid" });
});

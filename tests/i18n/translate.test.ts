// Проверки механизма перевода: откат, подстановки и формы (ADR 0039).
//
// TypeScript запускается напрямую: `node --test tests/i18n`. Vitest
// для чистых функций не нужен.

import assert from "node:assert/strict";
import test from "node:test";
import { translate } from "../../src/core/infra/i18n/translate.ts";
import type { Messages } from "../../src/core/infra/i18n/types.ts";

/** Эталон: русский встроенный словарь. */
const RU: Messages = {
  title: "Настройки",
  greeting: "Профиль {name}",
  counted: {
    one: "{count} файл",
    few: "{count} файла",
    many: "{count} файлов",
    other: "{count} файла",
  },
  empty: "",
};

/** Выбранный словарь: английский. */
const EN: Messages = {
  title: "Settings",
  greeting: "Profile {name}",
  counted: {
    one: "{count} file",
    other: "{count} files",
  },
};

test("выбранный словарь важнее эталона", () => {
  assert.equal(translate(EN, RU, "en", "title"), "Settings");
});

test("непереведённый ключ берётся из эталона", () => {
  assert.equal(translate(EN, RU, "en", "empty"), "");
});

test("неизвестный ключ возвращается как есть", () => {
  assert.equal(translate(EN, RU, "en", "missing.key"), "missing.key");
});

test("подстановка строки", () => {
  assert.equal(translate(RU, RU, "ru", "greeting", { name: "Дом" }), "Профиль Дом");
});

test("число подставляется по правилам локали", () => {
  assert.equal(translate(RU, RU, "ru", "greeting", { name: 5 }), "Профиль 5");
});

test("неизвестная подстановка остаётся видимой", () => {
  assert.equal(translate(RU, RU, "ru", "greeting"), "Профиль {name}");
});

test("русские формы выбираются по числу", () => {
  assert.equal(translate(RU, RU, "ru", "counted", { count: 1 }), "1 файл");
  assert.equal(translate(RU, RU, "ru", "counted", { count: 2 }), "2 файла");
  assert.equal(translate(RU, RU, "ru", "counted", { count: 5 }), "5 файлов");
  assert.equal(translate(RU, RU, "ru", "counted", { count: 21 }), "21 файл");
});

test("английские формы выбираются по числу", () => {
  assert.equal(translate(EN, RU, "en", "counted", { count: 1 }), "1 file");
  assert.equal(translate(EN, RU, "en", "counted", { count: 2 }), "2 files");
});

test("битая локаль откатывает формы на русские", () => {
  assert.equal(translate(RU, RU, "pt_BR", "counted", { count: 2 }), "2 файла");
});

test("пропущенная форма берётся из эталона, а не из чужой категории", () => {
  // В файле только `one`: для пяти файлов русская форма `many`, а не `one`.
  const partial: Messages = {
    title: "x",
    greeting: "y",
    counted: { one: "{count} file" },
  };
  assert.equal(translate(partial, RU, "en", "counted", { count: 5 }), "5 файлов");
});

test("набор форм без числа показывает other, а не первую форму", () => {
  assert.equal(translate(RU, RU, "ru", "counted"), "{count} файла");
});

test("пустая строка — это перевод, а не пропуск", () => {
  assert.equal(translate({ title: "" }, RU, "en", "title"), "");
});

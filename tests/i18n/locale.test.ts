// Проверки локали: категории склонения и проверка тега (ADR 0039).

import assert from "node:assert/strict";
import test from "node:test";
import {
  formatNumber,
  isLocaleTag,
  pluralCategories,
  pluralCategory,
} from "../../src/core/infra/i18n/locale.ts";

test("структурно годные теги локалей принимаются", () => {
  assert.equal(isLocaleTag("ru"), true);
  assert.equal(isLocaleTag("en"), true);
  assert.equal(isLocaleTag("pt-BR"), true);
});

test("невозможный тег локали отвергается", () => {
  assert.equal(isLocaleTag("pt_BR"), false);
  assert.equal(isLocaleTag(""), false);
});

test("русские категории: one, few, many", () => {
  assert.equal(pluralCategory("ru", 1), "one");
  assert.equal(pluralCategory("ru", 2), "few");
  assert.equal(pluralCategory("ru", 5), "many");
  assert.equal(pluralCategory("ru", 21), "one");
});

test("английские категории: one и other", () => {
  assert.equal(pluralCategory("en", 1), "one");
  assert.equal(pluralCategory("en", 2), "other");
});

test("битый тег даёт русские категории", () => {
  assert.equal(pluralCategory("pt_BR", 2), "few");
});

test("языку нужен свой набор категорий", () => {
  assert.deepEqual([...pluralCategories("ru")].sort(), ["few", "many", "one", "other"]);
  assert.deepEqual([...pluralCategories("en")].sort(), ["one", "other"]);
});

test("число форматируется и при битом теге", () => {
  assert.equal(formatNumber("pt_BR", 5), "5");
  assert.match(formatNumber("ru", 1000), /^1\s?000$/);
});

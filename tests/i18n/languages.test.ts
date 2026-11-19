// Модель языков: формы склонения, пропуски и документ дополнений (ADR 0057).
//
// Проверяются чистые функции без Vue и Tauri: `node --test tests/i18n`.

import assert from "node:assert/strict";
import test from "node:test";
import type { Messages } from "../../src/core/infra/i18n/types.ts";
import { enMessages } from "../../src/core/infra/i18n/messages.en.ts";
import { ruMessages } from "../../src/core/infra/i18n/messages.ts";
import { mergeMessages, missingDocumentFor } from "../../src/core/services/languages/model.ts";

test("пропущенные формы берутся из встроенного языка", () => {
  const merged = mergeMessages(
    { count: { one: "1 файл", few: "2 файла", many: "5 файлов", other: "файла" } },
    { count: { one: "1 file", other: "files" } },
  );

  assert.deepEqual(merged, {
    count: { one: "1 file", few: "2 файла", many: "5 файлов", other: "files" },
  });
});

test("строка внешнего файла перекрывает формы встроенного", () => {
  const merged = mergeMessages({ count: { one: "1 файл", other: "файла" } }, { count: "files" });

  assert.deepEqual(merged, { count: "files" });
});

test("формы внешнего файла перекрывают строку встроенного", () => {
  const merged = mergeMessages({ count: "файлов" }, { count: { one: "1 file", other: "files" } });

  assert.deepEqual(merged, { count: { one: "1 file", other: "files" } });
});

test("документ дополнений содержит только пропущенный ключ", () => {
  const partial: Messages = { ...enMessages };
  delete partial["settings.language.title"];

  const document = missingDocumentFor("en", "English", partial);

  assert.equal(document?.name, "English");
  assert.deepEqual(document?.messages, {
    "settings.language.title": "Language",
  });
});

test("неполные формы попадают в документ дополнений целиком", () => {
  const partial: Messages = { ...ruMessages };
  partial["settings.language.partial"] = { one: "одна строка" };

  const document = missingDocumentFor("ru", "Русский", partial);

  assert.deepEqual(document?.messages, {
    "settings.language.partial": {
      one: "Не хватает одной строки перевода - вместо неё показывается встроенный текст.",
      few: "Не хватает {count} строк перевода - вместо них показывается встроенный текст.",
      many: "Не хватает {count} строк перевода - вместо них показывается встроенный текст.",
      other: "Не хватает {count} строки перевода - вместо них показывается встроенный текст.",
    },
  });
});

test("полный словарь не даёт файла дополнений", () => {
  assert.equal(missingDocumentFor("en", "English", enMessages), null);
});

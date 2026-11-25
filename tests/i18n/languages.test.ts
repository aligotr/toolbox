// Модель языков: формы склонения, ключи add/remove и файл изменений
// (ADR 0057, ADR 0081).
//
// Проверяются чистые функции без Vue и Tauri: `node --test tests/i18n`.

import assert from "node:assert/strict";
import test from "node:test";
import type { Messages } from "../../src/core/infra/i18n/types.ts";
import { enMessages } from "../../src/core/infra/i18n/messages.en.ts";
import { ruMessages } from "../../src/core/infra/i18n/messages.ts";
import { mergeMessages, updatesDocumentFor } from "../../src/core/services/languages/model.ts";

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

test("документ изменений содержит только пропущенный ключ", () => {
  const partial: Messages = { ...enMessages };
  delete partial["common.language"];

  const document = updatesDocumentFor("en", "English", partial);

  assert.equal(document?.name, "English");
  assert.deepEqual(document?.add, {
    "common.language": "Language",
  });
  assert.deepEqual(document?.remove, []);
});

test("неполные формы попадают в документ изменений целиком", () => {
  const partial: Messages = { ...ruMessages };
  partial["journal.view.limit"] = { one: "одна запись" };

  const document = updatesDocumentFor("ru", "Русский", partial);

  assert.deepEqual(document?.add, {
    "journal.view.limit": {
      one: "Хранится последняя {count} запись",
      few: "Хранятся последние {count} записи",
      many: "Хранятся последние {count} записей",
      other: "Хранятся последние {count} записей",
    },
  });
  assert.deepEqual(document?.remove, []);
});

test("ключ, которого больше нет в программе, попадает в remove", () => {
  const extra: Messages = { ...enMessages, "old.key": "Old text" };

  const document = updatesDocumentFor("en", "English", extra);

  assert.deepEqual(document?.add, {});
  assert.deepEqual(document?.remove, ["old.key"]);
});

test("переименованный ключ виден и в add, и в remove", () => {
  const partial: Messages = { ...enMessages };
  delete partial["common.language"];
  partial["settings.language.old"] = "Language";

  const document = updatesDocumentFor("en", "English", partial);

  assert.deepEqual(document?.add, { "common.language": "Language" });
  assert.deepEqual(document?.remove, ["settings.language.old"]);
});

test("полный словарь не даёт файла изменений", () => {
  assert.equal(updatesDocumentFor("en", "English", enMessages), null);
});

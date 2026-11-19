// Очередь и текст уведомлений: чистые функции без DOM (ADR 0058).

import assert from "node:assert/strict";
import test from "node:test";
import { bufferNotice, noticeText, type QueuedNotice } from "../../src/core/infra/notifications.ts";

function queued(id: number, code: string, group?: string): QueuedNotice {
  return { id, kind: "info", code, text: code, group };
}

test("известный код переводится", () => {
  const text = noticeText(
    { kind: "info", code: "notifications.exported" },
    () => "Словарь выгружен",
    () => true,
  );

  assert.equal(text, "Словарь выгружен");
});

test("неизвестный код берёт русский резерв", () => {
  const text = noticeText(
    { kind: "error", code: "notifications.unknown", fallback: "Не удалось" },
    () => "notifications.unknown",
    () => false,
  );

  assert.equal(text, "Не удалось");
});

test("без резерва остаётся код", () => {
  const text = noticeText(
    { kind: "error", code: "notifications.unknown" },
    () => "notifications.unknown",
    () => false,
  );

  assert.equal(text, "notifications.unknown");
});

test("очередь держит не больше трёх", () => {
  let list: QueuedNotice[] = [];
  for (const id of [1, 2, 3, 4]) list = bufferNotice(list, queued(id, `code.${id}`));

  assert.deepEqual(
    list.map((item) => item.id),
    [2, 3, 4],
  );
});

test("одинаковая группа заменяет предыдущее", () => {
  let list = bufferNotice([], queued(1, "first", "files"));
  list = bufferNotice(list, queued(2, "other", "other"));
  list = bufferNotice(list, queued(3, "second", "files"));

  assert.deepEqual(
    list.map((item) => item.id),
    [2, 3],
  );
});

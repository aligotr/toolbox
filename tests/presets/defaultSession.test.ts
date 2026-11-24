// Проверки загрузки пресета по умолчанию в новую ячейку.
//
// Общий загрузчик (ADR 0028, ADR 0072) применяет пресет один раз на свежую
// ячейку, уважает незатронутый сеанс и пишет причину отказа в журнал.

import assert from "node:assert/strict";
import test from "node:test";
import { journal } from "../../src/core/infra/journal.ts";
import type { Preset, PresetApplyResult, Presets } from "../../src/core/services/presets/index.ts";
import { createDefaultPresetLoader } from "../../src/core/services/presets/defaultSession.ts";
import { cellKey, openTool, workspace } from "../../src/core/services/workspace/index.ts";

/** Сеанс, который заполняет пресет. */
interface TestSession {
  value: string;
}

/** Пресет с готовым конвертом. */
function presetOf(id: string): Preset {
  return { id, title: `Пресет ${id}`, savedAt: "2026-11-24T00:00:00Z", payload: {} };
}

/** Пресеты в памяти: только чтение нужно загрузчику. */
function presetsOf(items: Preset[], defaultId: string | null): Presets {
  const idle = () => ({ loading: false, error: null });

  return {
    state: { items, loaded: true, defaultId },
    status: {
      list: idle(),
      create: idle(),
      update: idle(),
      rename: idle(),
      duplicate: idle(),
      delete: idle(),
      default: idle(),
    },
    load: async () => {},
    create: async () => null,
    update: async () => null,
    rename: async () => null,
    duplicate: async () => null,
    remove: async () => false,
    setDefault: async () => false,
  };
}

/** Уникальный ключ свежей ячейки: вкладка открывается заново. */
function freshKey(toolId: string): string {
  workspace.tabs = [];
  workspace.activeId = "";
  openTool({ id: toolId, title: toolId, icon: "", component: null });
  return cellKey(workspace.activeId, 0, 0);
}

/** Загрузчик с записью вызовов применения. */
function loaderOf(
  presets: Presets,
  applied: string[],
  result: PresetApplyResult = { error: null, warnings: [] },
  canApply?: (session: TestSession) => boolean,
) {
  return createDefaultPresetLoader<TestSession>({
    presets,
    apply: async (_session, preset) => {
      applied.push(preset.id);
      return result;
    },
    journalSource: "test.presets",
    missingCode: "journal.presets.defaultMissing",
    canApply,
  });
}

test("свежая ячейка получает пресет по умолчанию ровно один раз", async () => {
  const applied: string[] = [];
  const load = loaderOf(presetsOf([presetOf("p1")], "p1"), applied);
  const key = freshKey("probe-once");

  await load({ value: "пусто" }, key);
  await load({ value: "пусто" }, key);

  assert.deepEqual(applied, ["p1"]);
});

test("без указателя умолчания пресет не применяется", async () => {
  const applied: string[] = [];
  const load = loaderOf(presetsOf([presetOf("p1")], null), applied);

  await load({ value: "пусто" }, freshKey("probe-none"));

  assert.deepEqual(applied, []);
});

test("тронутый сеанс не заполняется пресетом", async () => {
  const applied: string[] = [];
  const load = loaderOf(presetsOf([presetOf("p1")], "p1"), applied, undefined, () => false);

  await load({ value: "правка" }, freshKey("probe-touched"));

  assert.deepEqual(applied, []);
});

test("пропавший пресет по умолчанию попадает в журнал", async () => {
  const applied: string[] = [];
  const load = loaderOf(presetsOf([], "p9"), applied);
  journal.entries.length = 0;

  await load({ value: "пусто" }, freshKey("probe-missing"));

  assert.deepEqual(applied, []);
  assert.deepEqual(
    journal.entries.map((entry) => entry.code),
    ["journal.presets.defaultMissing"],
  );
  assert.equal(journal.entries[0]?.params.id, "p9");
});

test("ошибка применения попадает в журнал, предупреждения тоже", async () => {
  const applied: string[] = [];
  const load = loaderOf(presetsOf([presetOf("p1")], "p1"), applied, {
    error: { code: "presets.loadFailed", params: { title: "Пресет p1" } },
    warnings: [],
  });
  journal.entries.length = 0;

  await load({ value: "пусто" }, freshKey("probe-error"));

  assert.deepEqual(applied, ["p1"]);
  assert.deepEqual(
    journal.entries.map((entry) => entry.code),
    ["presets.loadFailed"],
  );
});

test("предупреждение о неполной загрузке пишется в журнал", async () => {
  const applied: string[] = [];
  const load = loaderOf(presetsOf([presetOf("p1")], "p1"), applied, {
    error: null,
    warnings: [{ code: "presets.warnRows", params: { count: 2 } }],
  });
  journal.entries.length = 0;

  await load({ value: "пусто" }, freshKey("probe-warning"));

  assert.deepEqual(applied, ["p1"]);
  assert.deepEqual(
    journal.entries.map((entry) => entry.code),
    ["presets.warnRows"],
  );
});

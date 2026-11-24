// Проверки общей привязки сеанса к пресету.
//
// Механизм один для инструментов (ADR 0028, ADR 0072): сеанс помнит пресет
// и снимок настроек, а «изменён» считается сравнением снимков. Формат
// настроек приносит инструмент, поэтому здесь он простой: список строк.

import assert from "node:assert/strict";
import test from "node:test";
import type { Preset, Presets } from "../../src/core/services/presets/index.ts";
import {
  createSessionPresets,
  type PresetBinding,
} from "../../src/core/services/presets/session.ts";

/** Сеанс с настройками, которые сохраняет пресет. */
interface TestSession extends PresetBinding {
  rows: string[];
}

/** Пресет с готовым конвертом: время и идентификатор фиксированы. */
function presetOf(id: string, title: string, rows: string[] = []): Preset {
  return { id, title, savedAt: "2026-11-24T00:00:00Z", payload: { rows } };
}

/** Пресеты в памяти: файлы заменены массивом. */
function presetsOf(items: Preset[] = []): Presets {
  const idle = () => ({ loading: false, error: null });

  return {
    state: { items, loaded: true, defaultId: null },
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
    create: async (title, payload) => {
      const preset: Preset = {
        id: `p${items.length + 1}`,
        title,
        savedAt: "2026-11-24T00:00:00Z",
        payload,
      };
      items.push(preset);
      return preset;
    },
    update: async (id, payload) => {
      const preset = items.find((item) => item.id === id);
      if (!preset) return null;
      preset.payload = payload;
      return preset;
    },
    rename: async (id, title) => {
      const preset = items.find((item) => item.id === id);
      if (!preset) return null;
      preset.title = title;
      return preset;
    },
    duplicate: async () => null,
    remove: async () => false,
    setDefault: async () => false,
  };
}

function sessionOf(rows: string[] = []): TestSession {
  return {
    rows,
    presetId: null,
    presetTitle: null,
    presetSnapshot: null,
  };
}

/** Привязка с простым форматом: строки настроек. */
function bindingOf(presets: Presets) {
  return createSessionPresets<TestSession, { rows: string[] }>({
    presets,
    capture: (session) => ({ rows: [...session.rows] }),
    parse: (payload) => {
      if (typeof payload !== "object" || payload === null) return null;
      const rows = (payload as { rows?: unknown }).rows;
      if (!Array.isArray(rows)) return null;
      return { payload: { rows: rows.filter((row): row is string => typeof row === "string") } };
    },
  });
}

test("сеанс без привязки не считается изменённым", () => {
  const binding = bindingOf(presetsOf());

  assert.equal(binding.changed(sessionOf(["a"])), false);
});

test("правка настроек помечает пресет изменённым, сохранение снимает отметку", async () => {
  const preset = presetOf("p1", "Основной", ["a"]);
  const presets = presetsOf([preset]);
  const binding = bindingOf(presets);
  const session = sessionOf(["a"]);

  binding.adopt(session, preset);
  assert.equal(binding.changed(session), false);

  session.rows.push("b");
  assert.equal(binding.changed(session), true);

  const saved = await binding.saveCurrent(session);
  assert.equal(saved?.id, "p1");
  assert.deepEqual(saved?.payload, { rows: ["a", "b"] });
  assert.equal(binding.changed(session), false);
});

test("снимок фиксируется до записи: правка во время сохранения остаётся изменением", async () => {
  const preset = presetOf("p1", "Основной", ["a"]);
  const presets = presetsOf([preset]);
  const binding = bindingOf(presets);
  const session = sessionOf(["a"]);
  binding.adopt(session, preset);

  // Пока идёт запись, пользователь успевает добавить строку.
  presets.update = async (id, payload) => {
    session.rows.push("b");
    return { ...preset, id, payload };
  };

  await binding.saveCurrent(session);

  assert.deepEqual(JSON.parse(session.presetSnapshot ?? ""), { rows: ["a"] });
  assert.equal(binding.changed(session), true);
});

test("создание пресета привязывает сеанс к новому файлу", async () => {
  const presets = presetsOf();
  const binding = bindingOf(presets);
  const session = sessionOf(["a"]);

  const created = await binding.createFromSession(session, "Новый");

  assert.equal(created?.title, "Новый");
  assert.equal(session.presetId, created?.id);
  assert.equal(session.presetTitle, "Новый");
  assert.equal(binding.changed(session), false);
});

test("снимок разбирается обратно, испорченный не роняет откат", () => {
  const preset = presetOf("p1", "Основной", ["a"]);
  const binding = bindingOf(presetsOf([preset]));
  const session = sessionOf(["a"]);
  binding.adopt(session, preset);

  assert.deepEqual(binding.readSnapshot(session), { rows: ["a"] });

  session.presetSnapshot = "{не json";
  assert.equal(binding.readSnapshot(session), null);
});

test("переименование и удаление трогают только совпадающую привязку", () => {
  const preset = presetOf("p1", "Основной");
  const other = presetOf("p2", "Другой");
  const binding = bindingOf(presetsOf([preset, other]));
  const session = sessionOf();
  binding.adopt(session, preset);

  binding.adoptTitle(session, other);
  assert.equal(session.presetTitle, "Основной");

  binding.adoptTitle(session, { ...preset, title: "Рабочий" });
  assert.equal(session.presetTitle, "Рабочий");

  binding.releaseDeleted(session, "p2");
  assert.equal(session.presetId, "p1");

  binding.releaseDeleted(session, "p1");
  assert.equal(session.presetId, null);
  assert.equal(session.presetTitle, null);
  assert.equal(session.presetSnapshot, null);
});

// Проверки механизма пресетов.
//
// Общий механизм для всех инструментов (ADR 0028): конверт, список, операции
// и указатель по умолчанию. Хранилище — Rust, поэтому команды Tauri заменены
// фейком в памяти: бизнес-логика ядра участвует в тесте как есть.
//
// Ожидаемые значения — литералы из словаря и контракта, а не вывод модуля.

import assert from "node:assert/strict";
import test from "node:test";
import type { AppError } from "../../src/contracts/errors.ts";
import type { StoredPreset } from "../../src/contracts/presets.ts";
import { installBuiltin } from "../../src/core/infra/i18n/index.ts";
import { ruMessages } from "../../src/core/infra/i18n/messages.ts";
import { journal } from "../../src/core/infra/journal.ts";
import {
  createPresets,
  defaultPresetTitle,
  type Preset,
} from "../../src/core/services/presets/index.ts";
import { setInvokeHandler } from "../support/fakes/core.mjs";

// `t("presets.copySuffix")` без словаря вернул бы ключ: механизм пресетов
// переводит приписку копии, поэтому словарь ставится как в приложении.
installBuiltin(ruMessages);

/** Имя инструмента: у каждого свой список пресетов. */
const TOOL = "dnslookup";

/** Состояние хранилища, которое тест наполняет через команды. */
interface Store {
  items: StoredPreset[];
  defaultId: string | null;
  warnings: AppError[];
  /** Команда, которая отвечает отказом; `null` — все успешны. */
  broken: string | null;
}

/** Хранилище пресетов в памяти: поведение команд контракта Rust. */
function storeOf(): Store {
  const store: Store = { items: [], defaultId: null, warnings: [], broken: null };
  let sequence = 0;

  /** Новый пресет с очередным идентификатором. */
  function created(title: string, payload: unknown): StoredPreset {
    sequence += 1;
    return { id: `p${sequence}`, title, saved_at: "2026-11-17T00:00:00Z", payload };
  }

  /** Пресет по идентификатору; отсутствие — отказ хранилища. */
  function find(id: string): StoredPreset {
    const preset = store.items.find((item) => item.id === id);
    if (!preset) throw new Error(`нет пресета ${id}`);
    return preset;
  }

  const commands: Record<string, (args: Record<string, never>) => unknown> = {
    presets_list: () => ({ items: store.items, warnings: store.warnings }),
    preset_default_get: () => ({ id: store.defaultId, warning: null }),
    preset_create: (args) => {
      const preset = created(args.title, args.payload);
      store.items.push(preset);
      return preset;
    },
    preset_update: (args) => {
      const preset = find(args.id);
      preset.payload = args.payload;
      return preset;
    },
    preset_rename: (args) => {
      const preset = find(args.id);
      preset.title = args.title;
      return preset;
    },
    preset_duplicate: (args) => {
      const source = find(args.id);
      const copy = created(`${source.title}${args.suffix}`, source.payload);
      store.items.push(copy);
      return copy;
    },
    preset_delete: (args) => {
      store.items = store.items.filter((item) => item.id !== args.id);
      return `trash/presets/${args.id}.json`;
    },
    preset_default_set: (args) => {
      store.defaultId = args.id;
      return store.defaultId;
    },
  };

  setInvokeHandler((command, args) => {
    if (command === store.broken) throw new Error(`отказ ${command}`);
    return commands[command](args as Record<string, never>);
  });

  return store;
}

/** Пресеты инструмента на чистом журнале и пустом хранилище. */
function fresh(): { store: Store; presets: ReturnType<typeof createPresets> } {
  journal.entries.length = 0;
  const store = storeOf();
  return { store, presets: createPresets(TOOL) };
}

/** Коды записей журнала в порядке показа: свежие сверху. */
function codes(): string[] {
  return journal.entries.map((entry) => entry.code);
}

test("создание пресета перечитывает список", async () => {
  const { presets } = fresh();

  const preset = await presets.create("Основной", { rows: [] });

  assert.equal(preset?.title, "Основной");
  assert.deepEqual(
    presets.state.items.map((item: Preset) => item.title),
    ["Основной"],
  );
  assert.equal(presets.state.loaded, true);
  assert.equal(presets.status.create.error, null);
  assert.deepEqual(codes(), ["journal.presets.created"]);
});

test("переименование меняет название и сохраняет идентификатор", async () => {
  const { presets } = fresh();
  const created = await presets.create("Основной", { rows: [] });

  const renamed = await presets.rename(created!.id, "Рабочий");

  assert.equal(renamed?.title, "Рабочий");
  assert.equal(renamed?.id, created!.id);
  assert.deepEqual(
    presets.state.items.map((item: Preset) => item.title),
    ["Рабочий"],
  );
});

test("копия получает приписку из словаря", async () => {
  const { presets } = fresh();
  const created = await presets.create("Основной", { rows: [] });

  const copy = await presets.duplicate(created!.id);

  assert.equal(copy?.title, "Основной (копия)");
  assert.deepEqual(
    presets.state.items.map((item: Preset) => item.title),
    ["Основной", "Основной (копия)"],
  );
});

test("удаление убирает пресет из списка", async () => {
  const { presets } = fresh();
  const created = await presets.create("Основной", { rows: [] });

  const removed = await presets.remove(created!);

  assert.equal(removed, true);
  assert.deepEqual(presets.state.items, []);
  assert.deepEqual(codes(), ["journal.presets.moved", "journal.presets.created"]);
});

test("пресет по умолчанию даёт подсказку, снятие убирает её", async () => {
  const { presets } = fresh();
  const created = await presets.create("Основной", { rows: [] });

  assert.equal(await presets.setDefault(created!.id), true);
  assert.equal(presets.state.defaultId, created!.id);
  assert.equal(defaultPresetTitle(TOOL), "Основной");

  assert.equal(await presets.setDefault(null), true);
  assert.equal(presets.state.defaultId, null);
  assert.equal(defaultPresetTitle(TOOL), null);
});

test("отказ команды остаётся в статусе и журнале, список не тронут", async () => {
  const { store, presets } = fresh();
  store.broken = "preset_create";

  const result = await presets.create("Основной", { rows: [] });

  assert.equal(result, null);
  assert.notEqual(presets.status.create.error, null);
  assert.deepEqual(presets.state.items, []);
  assert.deepEqual(codes(), ["journal.presets.createError"]);
});

test("битый файл списка попадает в журнал, целые пресеты остаются", async () => {
  const { store, presets } = fresh();
  store.items.push({ id: "p1", title: "Основной", saved_at: "", payload: null });
  store.warnings.push({
    code: "errors.presets.broken",
    params: { name: "p2.json" },
    fallback: "файл не разобран",
  });

  await presets.load();

  assert.deepEqual(
    presets.state.items.map((item: Preset) => item.title),
    ["Основной"],
  );
  assert.deepEqual(codes(), ["journal.presets.broken"]);
});

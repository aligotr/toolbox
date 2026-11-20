// Проверки подписи пресета по умолчанию на экране запуска.
//
// Экран запуска не ведёт пресеты: он только читает указатель и список,
// чтобы назвать пресет, который загрузится в новую вкладку (ADR 0062).
// Хранилище заменено фейком команд, как в тестах механизма пресетов;
// фейк отвергает чужой идентификатор инструмента.

import assert from "node:assert/strict";
import test from "node:test";
import type { StoredPreset } from "../../src/contracts/presets.ts";
import { journal } from "../../src/core/infra/journal.ts";
import { defaultPresetTitle } from "../../src/core/services/presets/defaultPreset.ts";
import { setInvokeHandler } from "../support/fakes/core.mjs";

/** Инструмент с пресетами: у каждого свой список. */
const TOOL = "dnslookup";

/** Состояние хранилища, которое тест наполняет через команды. */
interface Store {
  items: StoredPreset[];
  defaultId: string | null;
  /** Команда, которая отвечает отказом; `null` - все успешны. */
  broken: string | null;
}

/** Хранилище пресетов в памяти: поведение команд контракта Rust. */
function storeOf(): Store {
  const store: Store = { items: [], defaultId: null, broken: null };

  setInvokeHandler((command: string, args: { tool: string }) => {
    if (args.tool !== TOOL) throw new Error(`чужой инструмент ${args.tool}`);
    if (command === store.broken) throw new Error(`отказ ${command}`);
    if (command === "presets_list") return { items: store.items, warnings: [] };
    if (command === "preset_default_get") return { id: store.defaultId, warning: null };
    throw new Error(`неизвестная команда ${command}`);
  });

  return store;
}

/** Хранилище на чистом журнале перед сценарием. */
function freshStore(): Store {
  journal.entries.length = 0;
  return storeOf();
}

test("без умолчания подписи нет", async () => {
  freshStore();

  assert.equal(await defaultPresetTitle(TOOL), null);
  assert.deepEqual(journal.entries, []);
});

test("умолчание называет свой пресет", async () => {
  const store = freshStore();
  store.items.push({ id: "p1", title: "Рабочий", saved_at: "", payload: null });
  store.defaultId = "p1";

  assert.equal(await defaultPresetTitle(TOOL), "Рабочий");
});

test("указатель в пустоту подписи не даёт", async () => {
  const store = freshStore();
  store.defaultId = "p9";

  assert.equal(await defaultPresetTitle(TOOL), null);
});

test("отказ чтения скрывает подпись и попадает в журнал", async () => {
  const store = freshStore();
  store.broken = "presets_list";

  assert.equal(await defaultPresetTitle(TOOL), null);
  assert.deepEqual(
    journal.entries.map((entry) => entry.code),
    ["journal.presets.readError"],
  );
});

// Проверки счётчиков профилей и переключения.
//
// Счётчики запрашиваются отдельной командой: сайдбару они не нужны.
// Переключение сохраняет вкладки и не вызывает `app_restart` — перезапуск
// просит сама команда ядра (дополнение к ADR 0049).

import assert from "node:assert/strict";
import test from "node:test";
import { journal } from "../../src/core/infra/journal.ts";
import {
  loadProfilesUsage,
  profiles,
  profileUsage,
  profileUsageOf,
  switchProfile,
} from "../../src/core/services/profiles.ts";
import { calls, setInvokeHandler } from "../support/fakes/core.mjs";

test("счётчики грузятся отдельной командой", async () => {
  setInvokeHandler((command) => {
    if (command === "profiles_usage") {
      return [{ id: "work", presets: 2, data_files: 3 }];
    }
    return null;
  });

  await loadProfilesUsage();

  assert.deepEqual(profileUsageOf("work"), { id: "work", presets: 2, data_files: 3 });
  assert.equal(profileUsage.loaded, true);
  assert.equal(
    calls.some((call) => call.command === "profiles_list"),
    false,
    "счётчики не читают список",
  );
});

test("переключение сохраняет вкладки и не зовёт app_restart", async () => {
  journal.entries.length = 0;
  profiles.items = [{ id: "home", title: "Дом" }];
  profiles.active = "work";
  setInvokeHandler(() => null);

  await switchProfile("home");

  assert.deepEqual(
    calls.map((call) => call.command),
    ["workspace_save", "profile_switch"],
  );
  assert.deepEqual(calls[1].args, { id: "home" });
  assert.equal(journal.entries[0]?.code, "journal.profiles.switching");
  assert.equal(journal.entries[0]?.params.title, "Дом");
});

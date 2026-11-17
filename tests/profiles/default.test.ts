// Проверки профиля по умолчанию.
//
// Идентификатор по умолчанию приходит из ядра: интерфейс не должен повторять
// константу `work`, иначе смена константы в Rust тихо сломает автоназвание.
// Сценарий проверяется через фейк команд Tauri: ядро заменено обработчиком.

import assert from "node:assert/strict";
import test from "node:test";
import { installBuiltin } from "../../src/core/infra/i18n/index.ts";
import { ruMessages } from "../../src/core/infra/i18n/messages.ts";
import { journal } from "../../src/core/infra/journal.ts";
import { loadProfiles, profiles } from "../../src/core/services/profiles.ts";
import { calls, setInvokeHandler } from "../support/fakes/core.mjs";

installBuiltin(ruMessages);

/** Ответ ядра: один профиль, название совпадает с идентификатором. */
function listOf(defaultId: string) {
  return {
    active: defaultId,
    default_id: defaultId,
    items: [{ id: defaultId, title: defaultId }],
  };
}

test("название профиля по умолчанию берётся из default_id ядра", async () => {
  journal.entries.length = 0;
  let list = listOf("main");
  setInvokeHandler((command) => {
    if (command === "profiles_list") return list;
    if (command === "profile_rename") {
      list = { ...list, items: [{ id: "main", title: "Работа" }] };
      return { id: "main", title: "Работа" };
    }
    return null;
  });

  await loadProfiles();

  const renames = calls.filter((call) => call.command === "profile_rename");
  assert.equal(renames.length, 1);
  assert.deepEqual(renames[0].args, { id: "main", title: "Работа" });
  assert.equal(profiles.defaultId, "main");
  assert.equal(journal.entries[0]?.code, "journal.profiles.defaultNamed");
  assert.equal(
    calls.some((call) => call.command === "profiles_usage"),
    false,
    "список не запрашивает счётчики",
  );

  const renamesSoFar = calls.filter((call) => call.command === "profile_rename").length;
  await loadProfiles();
  assert.equal(
    calls.filter((call) => call.command === "profile_rename").length,
    renamesSoFar,
    "повторная загрузка не переименовывает профиль второй раз",
  );
});

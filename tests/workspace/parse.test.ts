// Проверки разбора `local/workspaces/<id>.json`.
//
// Разбор отделён от состояния (ADR 0047), поэтому проверяется без Vue
// и без Tauri: вход — документ файла, выход — вкладки или код отказа.

import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceFile } from "../../src/contracts/workspace.ts";
import { EMPTY_TAB_ICON, SINGLETON_TABS } from "../../src/core/constants.ts";
import { WORKSPACE_VERSION } from "../../src/core/services/workspace/constants.ts";
import { parseColumns } from "../../src/core/services/workspace/layout.ts";
import { parseWorkspaceFile } from "../../src/core/services/workspace/parse.ts";

/** Документ файла с вкладками: основа для подмены одного поля. */
function fileOf(tabs: unknown[], activeId: unknown = ""): Record<string, unknown> {
  return { version: WORKSPACE_VERSION, tabs, activeId };
}

/** Рабочая вкладка с одним инструментом. */
function tabOf(id: string, tools: string[] = ["dnslookup"]): Record<string, unknown> {
  return {
    id,
    kind: "workspace",
    title: "Проверка DNS",
    icon: "pi pi-bolt",
    columns: [{ width: 2, tools }],
  };
}

/** Успешный разбор: отказ в тесте, где ожидалось состояние. */
function parsed(value: unknown): WorkspaceFile {
  const result = parseWorkspaceFile(value);
  if ("code" in result) assert.fail(`ожидалось состояние, получен отказ ${result.code}`);
  return result;
}

test("не объект — отказ notObject", () => {
  for (const value of [null, [], "workspace", 42, undefined]) {
    assert.deepEqual(parseWorkspaceFile(value), {
      code: "journal.workspace.notObject",
      params: {},
    });
  }
});

test("чужая версия — отказ с версиями", () => {
  assert.deepEqual(parseWorkspaceFile({ version: 7, tabs: [] }), {
    code: "journal.workspace.version",
    params: { version: "7", expected: WORKSPACE_VERSION },
  });

  assert.deepEqual(parseWorkspaceFile({ tabs: [] }), {
    code: "journal.workspace.version",
    params: { version: "", expected: WORKSPACE_VERSION },
  });
});

test("нет массива вкладок — отказ noTabs", () => {
  for (const tabs of [undefined, null, {}, "tabs", 3]) {
    assert.deepEqual(parseWorkspaceFile({ version: WORKSPACE_VERSION, tabs }), {
      code: "journal.workspace.noTabs",
      params: {},
    });
  }
});

test("пустой список — валидное состояние без вкладок", () => {
  assert.deepEqual(parsed(fileOf([], "")), {
    version: WORKSPACE_VERSION,
    tabs: [],
    activeId: "",
  });
});

test("битые вкладки отброшены, целые остались", () => {
  const result = parsed(fileOf([5, { kind: "workspace" }, { id: "a", kind: "other" }, tabOf("b")]));

  assert.deepEqual(
    result.tabs.map((tab) => tab.id),
    ["b"],
  );
});

test("повтор идентификатора оставляет первую вкладку", () => {
  const result = parsed(fileOf([tabOf("a", ["dnslookup"]), tabOf("a", ["ping"])]));

  assert.equal(result.tabs.length, 1);
  assert.deepEqual(result.tabs[0].columns, [{ width: 2, tools: ["dnslookup"] }]);
});

test("второй журнал и вторые настройки отброшены", () => {
  const result = parsed(
    fileOf([
      { id: "j1", kind: "journal" },
      { id: "j2", kind: "journal" },
      { id: "s1", kind: "settings" },
      { id: "s2", kind: "settings" },
    ]),
  );

  assert.deepEqual(
    result.tabs.map((tab) => tab.id),
    ["j1", "s1"],
  );
});

test("пустая вкладка теряет подпись и получает иконку по умолчанию", () => {
  const result = parsed(
    fileOf([{ id: "a", kind: "workspace", title: "Новая вкладка", icon: "", columns: [] }]),
  );

  assert.deepEqual(result.tabs[0], {
    id: "a",
    kind: "workspace",
    title: "",
    icon: EMPTY_TAB_ICON,
    columns: [],
  });
});

test("вкладка с колонками сохраняет подпись и иконку", () => {
  const result = parsed(fileOf([tabOf("a")]));

  assert.equal(result.tabs[0].title, "Проверка DNS");
  assert.equal(result.tabs[0].icon, "pi pi-bolt");
});

test("одиночная вкладка получает иконку из констант и пустые колонки", () => {
  const result = parsed(
    fileOf([
      { id: "j", kind: "journal" },
      { id: "s", kind: "settings" },
    ]),
  );

  assert.deepEqual(result.tabs[0], {
    id: "j",
    kind: "journal",
    title: "",
    icon: SINGLETON_TABS.journal.icon,
    columns: [],
  });
  assert.equal(result.tabs[1].icon, SINGLETON_TABS.settings.icon);
  assert.deepEqual(result.tabs[1].columns, []);
});

test("активная вкладка сохраняется как есть", () => {
  assert.equal(parsed(fileOf([tabOf("a"), tabOf("b")], "b")).activeId, "b");
  assert.equal(parsed(fileOf([tabOf("a")], 5)).activeId, "");
});

test("колонки: ширина и инструменты приводятся к допустимым", () => {
  assert.deepEqual(
    parseColumns([
      { width: 0, tools: ["dnslookup", "", 3] },
      { width: -2, tools: [] },
      "junk",
      { tools: "dnslookup" },
      { width: 3 },
    ]),
    [
      { width: 1, tools: ["dnslookup"] },
      { width: 1, tools: [] },
    ],
  );
});

test("колонки не массив — пустая раскладка", () => {
  for (const value of [undefined, null, {}, "columns"]) {
    assert.deepEqual(parseColumns(value), []);
  }
});

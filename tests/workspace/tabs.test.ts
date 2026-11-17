// Проверки правил рабочего пространства.
//
// Правила живут в ядре, а не в компонентах: «вкладок не меньше одной»,
// «журнал один», «закрытие активной активирует соседнюю». Проверяется
// наблюдаемое состояние, а не порядок внутренних вызовов.
//
// Vue берётся настоящий (ADR 0047): состояние обязано быть наблюдаемым,
// и тест не подменяет реактивность заглушкой. Tauri заменён фейком команд.

import assert from "node:assert/strict";
import test from "node:test";
import type { ToolDescriptor } from "../../src/contracts/tools.ts";
import type { WorkspaceTab } from "../../src/contracts/workspace.ts";
import { journal } from "../../src/core/infra/journal.ts";
import {
  activateTab,
  cellKey,
  closeTab,
  ensureWorkspace,
  openEmptyTab,
  openSingleton,
  openTool,
  restartTab,
  takeFreshCell,
  workspace,
} from "../../src/core/services/workspace/index.ts";

/** Инструмент для выбора в сайдбаре. */
function toolOf(id: string, multipleTabs = false): ToolDescriptor {
  return { id, title: id, icon: "pi pi-bolt", multipleTabs, component: null };
}

/** Вкладка с одним инструментом. */
function tabOf(id: string): WorkspaceTab {
  return {
    id,
    kind: "workspace",
    title: id,
    icon: "pi pi-bolt",
    columns: [{ width: 1, tools: ["dnslookup"] }],
  };
}

/** Ставит ровно заданные вкладки: тест правил не зависит от прошлых. */
function setTabs(ids: string[], activeId = ids[0] ?? ""): void {
  workspace.tabs = ids.map(tabOf);
  workspace.activeId = activeId;
}

/** Чистое состояние: память вкладок и журнал не переходят между тестами. */
function reset(): void {
  workspace.tabs = [];
  workspace.activeId = "";
  journal.entries.length = 0;
}

/** Идентификаторы вкладок в порядке полосы. */
function ids(): string[] {
  return workspace.tabs.map((tab) => tab.id);
}

test("ensureWorkspace открывает пустую вкладку в пустом пространстве", () => {
  reset();
  ensureWorkspace();

  assert.deepEqual(ids(), [workspace.activeId]);
  assert.deepEqual(workspace.tabs[0].columns, []);
  assert.equal(workspace.tabs[0].title, "");
});

test("ensureWorkspace не трогает непустое пространство", () => {
  reset();
  setTabs(["a", "b"], "b");
  ensureWorkspace();

  assert.deepEqual(ids(), ["a", "b"]);
});

test("закрытие последней вкладки открывает новую пустую", () => {
  reset();
  setTabs(["a"], "a");
  closeTab("a");

  assert.equal(workspace.tabs.length, 1);
  assert.notEqual(workspace.tabs[0].id, "a");
  assert.equal(workspace.activeId, workspace.tabs[0].id);
});

test("закрытие активной активирует соседнюю справа", () => {
  reset();
  setTabs(["a", "b", "c"], "b");
  closeTab("b");

  assert.deepEqual(ids(), ["a", "c"]);
  assert.equal(workspace.activeId, "c");
});

test("закрытие активной у правого края активирует соседнюю слева", () => {
  reset();
  setTabs(["a", "b"], "b");
  closeTab("b");

  assert.deepEqual(ids(), ["a"]);
  assert.equal(workspace.activeId, "a");
});

test("закрытие неактивной не меняет активную", () => {
  reset();
  setTabs(["a", "b", "c"], "b");
  closeTab("c");

  assert.deepEqual(ids(), ["a", "b"]);
  assert.equal(workspace.activeId, "b");
});

test("закрытие неизвестной вкладки ничего не меняет", () => {
  reset();
  setTabs(["a", "b"], "b");
  closeTab("zzz");

  assert.deepEqual(ids(), ["a", "b"]);
  assert.equal(workspace.activeId, "b");
});

test("повторный выбор инструмента активирует его вкладку", () => {
  reset();
  const tool = toolOf("dnslookup");
  openTool(tool);
  const first = workspace.activeId;

  openTool(tool);

  assert.deepEqual(ids(), [first]);
  assert.equal(workspace.activeId, first);
});

test("выбор инструмента вытесняет пустую вкладку", () => {
  reset();
  openEmptyTab();
  const empty = workspace.activeId;
  openTool(toolOf("dnslookup"));

  assert.notEqual(workspace.activeId, empty);
  assert.equal(workspace.tabs.length, 1);
  assert.deepEqual(workspace.tabs[0].columns, [{ width: 1, tools: ["dnslookup"] }]);
});

test("жест «ещё одна вкладка» создаёт вторую только у многовариантного инструмента", () => {
  reset();
  const dns = toolOf("dnslookup", true);
  openTool(dns);
  openTool(dns, true);
  assert.equal(workspace.tabs.length, 2);

  reset();
  const ping = toolOf("ping");
  openTool(ping);
  openTool(ping, true);
  assert.equal(workspace.tabs.length, 1);
});

test("журнал и настройки открываются по одному экземпляру", () => {
  reset();
  openSingleton("journal");
  const journalId = workspace.activeId;
  openSingleton("journal");
  openSingleton("settings");

  assert.deepEqual(
    workspace.tabs.map((tab) => tab.kind),
    ["journal", "settings"],
  );
  assert.deepEqual(ids(), [journalId, workspace.activeId]);
});

test("повторное открытие журнала активирует существующую вкладку", () => {
  reset();
  setTabs(["a"], "a");
  openSingleton("journal");
  const journalId = workspace.activeId;
  activateTab("a");

  openSingleton("journal");

  assert.equal(workspace.activeId, journalId);
  assert.equal(workspace.tabs.filter((tab) => tab.kind === "journal").length, 1);
});

test("активация неизвестной вкладки игнорируется", () => {
  reset();
  setTabs(["a", "b"], "a");
  activateTab("zzz");

  assert.equal(workspace.activeId, "a");
});

test("перезапуск вкладки заменяет её копией на том же месте", () => {
  reset();
  setTabs(["a", "b"], "b");
  const before = workspace.tabs[0];

  restartTab("a");

  const restarted = workspace.tabs[0];
  assert.notEqual(restarted.id, "a");
  assert.deepEqual(ids(), [restarted.id, "b"]);
  assert.equal(restarted.title, before.title);
  assert.deepEqual(restarted.columns, before.columns);
  assert.equal(workspace.activeId, "b");
});

test("перезапуск активной вкладки оставляет её активной", () => {
  reset();
  setTabs(["a", "b"], "a");

  restartTab("a");

  assert.equal(workspace.activeId, workspace.tabs[0].id);
});

test("перезапуск помечает ячейки копии свежими ровно один раз", () => {
  reset();
  setTabs(["a"], "a");
  restartTab("a");
  const key = cellKey(workspace.activeId, 0, 0);

  assert.equal(takeFreshCell(key), true);
  assert.equal(takeFreshCell(key), false);
});

test("перезапуск записывает факт в журнал", () => {
  reset();
  setTabs(["a"], "a");
  restartTab("a");

  assert.equal(journal.entries[0].code, "journal.workspace.restarted");
  assert.deepEqual(journal.entries[0].params, { title: "a" });
});

test("перезапуск одиночной вкладки ничего не меняет", () => {
  reset();
  workspace.tabs = [
    { id: "j", kind: "journal", title: "", icon: "pi pi-history", columns: [] },
  ];
  workspace.activeId = "j";

  restartTab("j");

  assert.deepEqual(ids(), ["j"]);
  assert.equal(journal.entries.length, 0);
});

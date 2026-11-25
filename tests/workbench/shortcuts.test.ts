// Проверки горячих клавиш оболочки.
//
// Ctrl+W закрывает активную вкладку теми же правилами, что и крестик:
// соседняя справа становится активной, последняя вкладка заменяется пустой.
// Ctrl+B не должен потеряться при добавлении новой клавиши.

import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import type { WorkspaceTab } from "../../src/contracts/workspace.ts";
import { workspace } from "../../src/core/services/workspace/index.ts";
import { handleWorkbenchKeydown } from "../../src/workbench/shortcuts.ts";

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

/** Ставит ровно заданные вкладки: тест не зависит от прошлых. */
function setTabs(ids: string[], activeId = ids[0] ?? ""): void {
  workspace.tabs = ids.map(tabOf);
  workspace.activeId = activeId;
}

/** Идентификаторы вкладок в порядке полосы. */
function ids(): string[] {
  return workspace.tabs.map((tab) => tab.id);
}

interface KeyOptions {
  key?: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
}

/** Событие клавиши с записью вызова `preventDefault`. */
function press(code: string, options: KeyOptions = {}) {
  let prevented = false;
  const event = {
    code,
    key: options.key ?? "",
    ctrlKey: true,
    altKey: false,
    shiftKey: false,
    repeat: false,
    ...options,
    preventDefault() {
      prevented = true;
    },
  } as KeyboardEvent;

  return { event, wasPrevented: () => prevented };
}

beforeEach(() => {
  workspace.tabs = [];
  workspace.activeId = "";
});

test("Ctrl+W закрывает активную вкладку и активирует соседнюю справа", () => {
  setTabs(["a", "b", "c"], "b");
  const { event, wasPrevented } = press("KeyW");

  handleWorkbenchKeydown(event, () => {});

  assert.deepEqual(ids(), ["a", "c"]);
  assert.equal(workspace.activeId, "c");
  assert.equal(wasPrevented(), true);
});

test("Ctrl+W закрывает последнюю вкладку и заменяет её пустой", () => {
  setTabs(["a"], "a");
  const { event } = press("KeyW");

  handleWorkbenchKeydown(event, () => {});

  assert.equal(workspace.tabs.length, 1);
  assert.notEqual(workspace.tabs[0].id, "a");
  assert.deepEqual(workspace.tabs[0].columns, []);
  assert.equal(workspace.activeId, workspace.tabs[0].id);
});

test("Ctrl+W не требует латинской раскладки", () => {
  setTabs(["a", "b"], "a");
  const { event } = press("KeyW", { key: "ц" });

  handleWorkbenchKeydown(event, () => {});

  assert.deepEqual(ids(), ["b"]);
});

test("Ctrl+W не срабатывает без Ctrl", () => {
  setTabs(["a", "b"], "a");
  const { event, wasPrevented } = press("KeyW", { ctrlKey: false });

  handleWorkbenchKeydown(event, () => {});

  assert.deepEqual(ids(), ["a", "b"]);
  assert.equal(wasPrevented(), false);
});

test("Ctrl+W не срабатывает с Alt, Shift или автоповтором", () => {
  for (const options of [{ altKey: true }, { shiftKey: true }, { repeat: true }]) {
    setTabs(["a", "b"], "a");
    const { event, wasPrevented } = press("KeyW", options);

    handleWorkbenchKeydown(event, () => {});

    assert.deepEqual(ids(), ["a", "b"]);
    assert.equal(wasPrevented(), false);
  }
});

test("Ctrl+W без активной вкладки ничего не закрывает", () => {
  const { event, wasPrevented } = press("KeyW");

  handleWorkbenchKeydown(event, () => {});

  assert.deepEqual(workspace.tabs, []);
  assert.equal(workspace.activeId, "");
  assert.equal(wasPrevented(), true);
});

test("Ctrl+B по-прежнему переключает сайдбар", () => {
  setTabs(["a", "b"], "b");
  let toggles = 0;
  const { event, wasPrevented } = press("KeyB");

  handleWorkbenchKeydown(event, () => {
    toggles += 1;
  });

  assert.equal(toggles, 1);
  assert.equal(wasPrevented(), true);
  assert.deepEqual(ids(), ["a", "b"]);
});

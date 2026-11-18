// Рабочее пространство: открытые вкладки и активная вкладка.
//
// Состояние живёт вне компонентов: перерисовка сайдбара или полосы вкладок
// не должна его терять. Файл `local/workspaces/<id>.json` продолжает это состояние
// между запусками (ADR 0011, ADR 0050).
//
// Оболочка не решает, что считать вкладкой, — это делают функции ниже.
// Поэтому правила «вкладок не меньше одной», «журнал один» и «закрытие
// активной активирует соседнюю» записаны один раз, а не в каждом компоненте.
//
// Разбор файла живёт рядом, в `parse.ts`: восстановление вкладки — то же
// правило, что и её открытие, только источник другой. Битый файл не должен
// оставлять пустое окно, поэтому любая поломка сводится к одной пустой вкладке
// и записи в журнале.

import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { reactive, ref, toRaw, watch } from "vue";
import type { ToolDescriptor } from "@/contracts/tools";
import type { SingletonKind, TabColumn, WorkspaceFile, WorkspaceTab } from "@/contracts/workspace";
import { EMPTY_TAB_ICON, SINGLETON_TABS } from "../../constants";
import { JOURNAL_CORE_SOURCE } from "../../infra/constants";
import { write } from "../../infra/journal";
import {
  WORKSPACE_CLOSE_TIMEOUT_MS,
  WORKSPACE_SAVE_DELAY_MS,
  WORKSPACE_VERSION,
} from "./constants";
import { copyColumns } from "./layout";
import { parseWorkspaceFile } from "./parse";
import { forgetTab, recentTabIds, rememberTab, resetRecentTabs } from "./recentTabs";

/** Состояние рабочего пространства. */
export interface WorkspaceState {
  tabs: WorkspaceTab[];
  /** Идентификатор активной вкладки; пустая строка — вкладок ещё нет. */
  activeId: string;
}

/** Общее состояние рабочего пространства. */
export const workspace = reactive<WorkspaceState>({ tabs: [], activeId: "" });

/**
 * Счётчик фокусировок: полоса вкладок по нему понимает, что активную нужно
 * показать, даже если она уже была активной. В файл не попадает.
 */
export const focusTick = ref(0);

/** Делает вкладку активной и отмечает её свежей в памяти активаций. */
function focusTab(id: string): void {
  workspace.activeId = id;
  focusTick.value += 1;
  rememberTab(id);
}

/**
 * Ключ места инструмента в сетке.
 *
 * Формат один на всё приложение (ADR 0017): им пользуются и сетка, и оболочка,
 * помечающая свежие ячейки. Смена формата не должна расходиться между ними.
 */
export function cellKey(tabId: string, columnIndex: number, toolIndex: number): string {
  return `${tabId}:${columnIndex}:${toolIndex}`;
}

/**
 * Ячейки, появившиеся вместе с вкладкой.
 *
 * Инструмент грузит пресет по умолчанию только в такую ячейку: добавленная
 * в уже открытую вкладку остаётся пустой. Признак временный и гаснет при
 * первом обращении, поэтому включает пресет ровно один раз.
 */
const freshCells = new Set<string>();

/** Помечает ячейки новой вкладки как свежие. */
function markFreshCells(tabId: string, columns: TabColumn[]): void {
  columns.forEach((column, columnIndex) => {
    column.tools.forEach((_, toolIndex) => {
      freshCells.add(cellKey(tabId, columnIndex, toolIndex));
    });
  });
}

/** Забывает свежесть всех ячеек вкладки: закрытая вкладка больше не новая. */
function forgetFreshCells(tabId: string): void {
  const prefix = `${tabId}:`;
  for (const key of freshCells) {
    if (key.startsWith(prefix)) freshCells.delete(key);
  }
}

/**
 * Забирает признак свежести ячейки.
 *
 * `true` — ячейка появилась вместе с вкладкой и ещё не видела пресета;
 * повторное обращение вернёт `false`, поэтому загрузка не повторится.
 */
export function takeFreshCell(cellKey: string): boolean {
  return freshCells.delete(cellKey);
}

/** Создаёт новую вкладку и делает её активной. */
function addTab(tab: WorkspaceTab): WorkspaceTab {
  workspace.tabs.push(tab);
  focusTab(tab.id);
  markFreshCells(tab.id, tab.columns);
  return tab;
}

/** Создаёт пустую вкладку — экран запуска рабочего пространства. */
export function openEmptyTab(): void {
  addTab({
    id: crypto.randomUUID(),
    kind: "workspace",
    title: "",
    icon: EMPTY_TAB_ICON,
    columns: [],
  });
}

/** Пустая вкладка — экран запуска без единой колонки. */
function isEmptyTab(tab: WorkspaceTab): boolean {
  return tab.kind === "workspace" && tab.columns.length === 0;
}

/**
 * Освобождает полосу от пустых вкладок перед открытием содержимого.
 *
 * «Новая вкладка» — экран запуска, а не рабочее место: как только пользователь
 * выбирает инструмент или одиночный экран, она уступает ему место.
 * Иначе рядом с работой остаётся окно без содержимого, из которого открывали
 * следующее (ADR 0040).
 */
function dropEmptyTabs(): void {
  const empty = new Set(workspace.tabs.filter(isEmptyTab).map((tab) => tab.id));
  if (empty.size === 0) return;

  workspace.tabs = workspace.tabs.filter((tab) => !empty.has(tab.id));
  for (const id of empty) {
    forgetFreshCells(id);
    forgetTab(id);
  }
}

/** Вкладка содержит инструмент хотя бы в одной колонке. */
function tabHasTool(tab: WorkspaceTab, toolId: string): boolean {
  return tab.kind === "workspace" && tab.columns.some((column) => column.tools.includes(toolId));
}

/**
 * Ищет подходящую вкладку, начиная с последней активной.
 *
 * Память может не знать о вкладке — например, файл восстановлен без истории.
 * Тогда порядок прежний: активная, затем слева направо. Он же действует
 * после перезапуска, пока пользователь ничего не выбрал (ADR 0042).
 */
function lastActiveMatching(match: (tab: WorkspaceTab) => boolean): WorkspaceTab | undefined {
  for (const id of recentTabIds()) {
    const tab = workspace.tabs.find((item) => item.id === id);
    if (tab && match(tab)) return tab;
  }

  const active = workspace.tabs.find((tab) => tab.id === workspace.activeId && match(tab));
  return active ?? workspace.tabs.find(match);
}

/**
 * Открывает вкладку, которая существует в единственном экземпляре.
 *
 * Совпадение задаёт вызывающий: журнал и настройки ищутся по виду вкладки,
 * инструмент — по месту в колонках. Нашлась — активируем последнюю активную,
 * иначе создаём. Пустые вкладки уступают место содержимому в обоих случаях
 * (ADR 0040).
 */
function openUniqueTab(match: (tab: WorkspaceTab) => boolean, create: () => void): void {
  dropEmptyTabs();

  const existing = lastActiveMatching(match);
  if (existing) {
    focusTab(existing.id);
    return;
  }

  create();
}

/**
 * Открывает инструмент: обычный выбор или ещё одна вкладка.
 *
 * Обычный выбор ведёт в последнюю активную вкладку с инструментом, а если
 * такой нет — создаёт новую. Умолчание одно для инструментов и разделов
 * (ADR 0042).
 *
 * `another` — жест «ещё одна вкладка»: Ctrl+клик, средняя кнопка мыши или
 * Ctrl+Enter. Он действует только на многовариантный инструмент
 * (`multipleTabs`); у остальных вторая вкладка не появляется. Новая вкладка
 * содержит только выбранный инструмент: общую раскладку не разбираем,
 * а вкладку с другими инструментами не дублируем.
 */
export function openTool(tool: ToolDescriptor, another = false): void {
  const create = (): void => {
    const columns: TabColumn[] = [{ width: 1, tools: [tool.id] }];
    addTab({
      id: crypto.randomUUID(),
      kind: "workspace",
      title: tool.title,
      icon: tool.icon,
      columns,
    });
  };

  if (tool.multipleTabs && another) {
    dropEmptyTabs();
    create();
    return;
  }

  openUniqueTab((tab) => tabHasTool(tab, tool.id), create);
}

/**
 * Открывает журнал или настройки — вкладку, которая существует в одном
 * экземпляре.
 *
 * Повторный клик переключает на уже открытую: второй экземпляр журнала
 * показывал бы те же записи и занимал место в полосе. Это то же умолчание,
 * что у инструментов без `multipleTabs` (ADR 0042).
 */
export function openSingleton(kind: SingletonKind): void {
  openUniqueTab(
    (tab) => tab.kind === kind,
    () => {
      const meta = SINGLETON_TABS[kind];
      addTab({
        id: crypto.randomUUID(),
        kind,
        title: "",
        icon: meta.icon,
        columns: [],
      });
    },
  );
}

/** Делает вкладку активной, если она ещё существует. */
export function activateTab(id: string): void {
  if (workspace.tabs.some((tab) => tab.id === id)) {
    focusTab(id);
  }
}

/**
 * Закрывает вкладку.
 *
 * Закрытие последней не оставляет пустое окно: вместо неё открывается новая
 * пустая вкладка. Если закрыта активная, активной становится соседняя справа,
 * а при её отсутствии — слева.
 */
export function closeTab(id: string): void {
  const index = workspace.tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return;

  const wasActive = workspace.activeId === id;
  workspace.tabs.splice(index, 1);
  forgetTab(id);

  if (workspace.tabs.length === 0) {
    openEmptyTab();
  } else if (wasActive) {
    const next = workspace.tabs[Math.min(index, workspace.tabs.length - 1)];
    focusTab(next.id);
  }

  forgetFreshCells(id);
}

/** Гарантирует хотя бы одну вкладку — при первом показе оболочки. */
export function ensureWorkspace(): void {
  if (workspace.tabs.length === 0) {
    openEmptyTab();
  }
}

// ───────────────────────────── Файл рабочего пространства ────────────────────

/**
 * Восстанавливает вкладки из файла.
 *
 * Отсутствие файла — первый запуск, а не повод для записи в журнал. Любая
 * другая поломка объясняется в журнале: пользователь должен понимать, почему
 * вместо его вкладок открылась пустая.
 */
async function restore(): Promise<void> {
  // История активаций принадлежит сеансу: любой запуск начинает историю
  // заново, в том числе после отказа чтения (ADR 0042).
  resetRecentTabs();

  let stored: unknown;

  try {
    stored = await invoke<unknown>("workspace_load");
  } catch (error) {
    write(JOURNAL_CORE_SOURCE, "error", "journal.workspace.readError", {
      reason: error,
    });
    return;
  }

  if (stored === null) {
    return;
  }

  const parsed = parseWorkspaceFile(stored);
  if ("code" in parsed) {
    write(JOURNAL_CORE_SOURCE, "error", parsed.code, parsed.params);
    return;
  }

  workspace.tabs = parsed.tabs;

  // Память начинается с активной вкладки, а если её нет — с самой левой.
  const active = parsed.tabs.some((tab) => tab.id === parsed.activeId)
    ? parsed.activeId
    : (parsed.tabs[0]?.id ?? "");

  if (active) {
    focusTab(active);
  } else {
    workspace.activeId = "";
  }
}

/** Снимок состояния для файла: копия, которую нельзя изменить из интерфейса. */
function snapshot(): WorkspaceFile {
  const tabs = toRaw(workspace.tabs).map((tab) => ({
    id: tab.id,
    kind: tab.kind,
    title: tab.title,
    icon: tab.icon,
    columns: copyColumns(tab.columns),
  }));

  return {
    version: WORKSPACE_VERSION,
    tabs,
    activeId: workspace.activeId,
  };
}

/** Очередь записей: две одновременные записи одного файла недопустимы. */
let saveChain: Promise<void> = Promise.resolve();
let saveTimer: number | undefined;
let persistenceStarted = false;

/**
 * Записывает рабочее пространство.
 *
 * Записи выстраиваются в цепочку: таймер и закрытие окна могут сработать
 * одновременно, и вторая запись не должна обгонять первую. Отказ не рвёт
 * цепочку — следующая правка попробует снова.
 */
async function save(): Promise<void> {
  const data = snapshot();

  saveChain = saveChain
    .then(() => invoke<void>("workspace_save", { data }))
    .catch((error: unknown) => {
      write(JOURNAL_CORE_SOURCE, "error", "journal.workspace.saveError", {
        reason: error,
      });
    });

  await saveChain;
}

/** Откладывает запись до тишины: движение границы колонки — не повод писать. */
function scheduleSave(): void {
  if (!persistenceStarted) return;

  if (saveTimer !== undefined) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = undefined;
    void save();
  }, WORKSPACE_SAVE_DELAY_MS);
}

/** Сохраняет немедленно: ждать таймер больше нечего. */
export async function flushWorkspace(): Promise<void> {
  if (saveTimer !== undefined) {
    window.clearTimeout(saveTimer);
    saveTimer = undefined;
  }
  await save();
}

/** Ожидание с пределом: окно не должно зависеть от зависшей записи. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Запускает рабочее пространство: восстанавливает вкладки и следит за файлом.
 *
 * Возвращает остановку: наблюдатель и обработчик закрытия снимаются вместе
 * с оболочкой, иначе повторное монтирование удвоило бы записи.
 */
export async function startWorkspace(): Promise<() => void> {
  await restore();
  ensureWorkspace();

  // Последняя правка может ещё ждать таймера. Обработчик закрытия сохраняет
  // её и не мешает окну закрыться, если запись не успела.
  let unlisten: UnlistenFn = () => {};
  try {
    unlisten = await getCurrentWindow().onCloseRequested(async () => {
      try {
        await Promise.race([flushWorkspace(), delay(WORKSPACE_CLOSE_TIMEOUT_MS)]);
      } catch (error) {
        // Окно обязано закрыться: причина уже записана в журнал.
        write(JOURNAL_CORE_SOURCE, "error", "journal.workspace.closeSaveError", {
          reason: error,
        });
      }
    });
  } catch (error) {
    // Без обработчика закрытия остаётся отложенная запись: теряется только
    // последняя правка, сделанная за мгновение до выхода.
    write(JOURNAL_CORE_SOURCE, "error", "journal.workspace.closeHandlerError", {
      reason: error,
    });
  }

  const stopWatch = watch(workspace, scheduleSave, { deep: true });
  persistenceStarted = true;

  return () => {
    persistenceStarted = false;
    stopWatch();
    unlisten();
  };
}

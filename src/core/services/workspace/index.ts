// Рабочее пространство: открытые вкладки и активная вкладка.
//
// Состояние живёт вне компонентов: перерисовка сайдбара или полосы вкладок
// не должна его терять. Файл `local/workspace.json` продолжает это состояние
// между запусками (ADR 0011).
//
// Оболочка не решает, что считать вкладкой, — это делают функции ниже.
// Поэтому правила «вкладок не меньше одной», «журнал один» и «закрытие
// активной активирует соседнюю» записаны один раз, а не в каждом компоненте.
//
// Разбор файла живёт здесь же: восстановление вкладки — то же правило, что
// и её открытие, только источник другой. Битый файл не должен оставлять
// пустое окно, поэтому любая поломка сводится к одной пустой вкладке
// и записи в журнале.

import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { reactive, toRaw, watch } from "vue";
import type { Template } from "../templates";
import type { ToolDescriptor } from "@/contracts/tools";
import type {
  Binding,
  SingletonKind,
  TabColumn,
  WorkspaceFile,
  WorkspaceTab,
} from "@/contracts/workspace";
import { EMPTY_TAB_ICON, SINGLETON_TABS } from "../../constants";
import { JOURNAL_CORE_SOURCE } from "../../infra/constants";
import { isRecord } from "../../infra/guards";
import { write, type JournalFact } from "../../infra/journal";
import {
  TEMPLATE_TAB_ICON,
  WORKSPACE_CLOSE_TIMEOUT_MS,
  WORKSPACE_SAVE_DELAY_MS,
  WORKSPACE_VERSION,
} from "./constants";
import { copyColumns, parseColumns } from "./layout";
import * as templateBindings from "../templates/bindings";

/** Состояние рабочего пространства. */
export interface WorkspaceState {
  tabs: WorkspaceTab[];
  /** Идентификатор активной вкладки; пустая строка — вкладок ещё нет. */
  activeId: string;
}

/** Общее состояние рабочего пространства. */
export const workspace = reactive<WorkspaceState>({ tabs: [], activeId: "" });

/**
 * Ключ места инструмента в сетке.
 *
 * Формат один на всё приложение (ADR 0017): им пользуются и сетка, и оболочка,
 * помечающая свежие ячейки. Смена формата не должна расходиться между ними.
 */
export function cellKey(
  tabId: string,
  columnIndex: number,
  toolIndex: number,
): string {
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
  workspace.activeId = tab.id;
  markFreshCells(tab.id, tab.columns);
  return tab;
}

/** Создаёт пустую вкладку — ту самую «главную», с шаблонами и инструментами. */
export function openEmptyTab(): void {
  addTab({
    id: crypto.randomUUID(),
    kind: "workspace",
    title: "",
    icon: EMPTY_TAB_ICON,
    columns: [],
  });
}

/**
 * Открывает инструмент в новой вкладке.
 *
 * Колонка одна на всю ширину: добавление в существующую вкладку делается
 * перетаскиванием, а клик в сайдбаре всегда создаёт рабочее место (ADR 0011).
 */
export function openTool(tool: ToolDescriptor): void {
  const columns: TabColumn[] = [{ width: 1, tools: [tool.id] }];
  addTab({
    id: crypto.randomUUID(),
    kind: "workspace",
    title: tool.title,
    icon: tool.icon,
    columns,
  });
}

/**
 * Открывает одиночную вкладку — журнал или настройки.
 *
 * Повторный клик переключает на уже открытую: второй экземпляр журнала
 * показывал бы те же записи и занимал место в полосе.
 */
export function openSingleton(kind: SingletonKind): void {
  const existing = workspace.tabs.find((tab) => tab.kind === kind);
  if (existing) {
    workspace.activeId = existing.id;
    return;
  }

  const meta = SINGLETON_TABS[kind];
  addTab({
    id: crypto.randomUUID(),
    kind,
    title: "",
    icon: meta.icon,
    columns: [],
  });
}

/** Делает вкладку активной, если она ещё существует. */
export function activateTab(id: string): void {
  if (workspace.tabs.some((tab) => tab.id === id)) {
    workspace.activeId = id;
  }
}

/**
 * Заполняет пустую вкладку шаблоном.
 *
 * Только пустую: заполнение занятой стёрло бы текущую работу, а вернуть её
 * было бы нечем. `false` — вкладка занята, не найдена или не рабочая.
 */
export function applyTemplate(tabId: string, template: Template): boolean {
  const tab = workspace.tabs.find((item) => item.id === tabId);
  if (!tab || tab.kind !== "workspace" || tab.columns.length > 0) return false;

  templateBindings.apply(tab, template);
  // Инструменты появились вместе с вкладкой — значит, в них место пресету
  // по умолчанию, даже если сама вкладка была открыта раньше.
  markFreshCells(tab.id, tab.columns);
  return true;
}

/** Открывает шаблон новой вкладкой: так его применяют из настроек. */
export function openTemplate(template: Template): void {
  const tab = addTab({
    id: crypto.randomUUID(),
    kind: "workspace",
    title: template.title,
    icon: TEMPLATE_TAB_ICON,
    columns: [],
  });
  templateBindings.apply(tab, template);
  markFreshCells(tab.id, tab.columns);
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

  if (workspace.tabs.length === 0) {
    openEmptyTab();
  } else if (wasActive) {
    const next = workspace.tabs[Math.min(index, workspace.tabs.length - 1)];
    workspace.activeId = next.id;
  }

  // Связка закрытой вкладки больше не нужна: иначе файл копил бы записи
  // о вкладках, которых нет.
  templateBindings.prune(new Set(workspace.tabs.map((tab) => tab.id)));
  forgetFreshCells(id);
}

/**
 * Перезапускает вкладку: инструменты возвращаются к состоянию нового окна.
 *
 * Вкладка заменяется копией под новым идентификатором в той же позиции:
 * место в сетке задаёт ключ сеанса инструмента (ADR 0017), поэтому прежние
 * сеансы остаются без вкладки и следующий показ заводит их заново.
 * Раскладка, заголовок, иконка и привязка к шаблону сохраняются.
 */
export function restartTab(id: string): void {
  const index = workspace.tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return;

  const tab = workspace.tabs[index];
  if (tab.kind !== "workspace") return;

  // Связка принадлежит вкладке, а не её идентификатору: переносим её,
  // иначе перезапуск молча открепил бы шаблон.
  const binding = templateBindings.of(id);
  const next: WorkspaceTab = {
    id: crypto.randomUUID(),
    kind: tab.kind,
    title: tab.title,
    icon: tab.icon,
    columns: copyColumns(tab.columns),
  };

  const wasActive = workspace.activeId === id;
  workspace.tabs.splice(index, 1, next);
  if (wasActive) workspace.activeId = next.id;

  templateBindings.drop(id);
  if (binding) templateBindings.store(next.id, binding);

  forgetFreshCells(id);
  markFreshCells(next.id, next.columns);

  const fact: JournalFact = next.title
    ? { code: "journal.workspace.restarted", params: { title: next.title } }
    : { code: "journal.workspace.restartedEmpty", params: {} };
  write(JOURNAL_CORE_SOURCE, "info", fact.code, fact.params);
}

/** Гарантирует хотя бы одну вкладку — при первом показе оболочки. */
export function ensureWorkspace(): void {
  if (workspace.tabs.length === 0) {
    openEmptyTab();
  }
}

// ───────────────────────────── Файл рабочего пространства ────────────────────

/**
 * Разбирает одну вкладку.
 *
 * `null` — вкладка испорчена так, что чинить нечего (нет идентификатора
 * или вида). Подписи одиночных вкладок и пустой вкладки не хранятся в файле:
 * они берутся из словаря при показе, иначе после смены языка в полосе
 * остался бы прежний язык.
 */
function parseTab(value: unknown): WorkspaceTab | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || !value.id) return null;

  const kind: unknown = value.kind;
  if (kind !== "workspace" && kind !== "journal" && kind !== "settings") return null;

  if (kind !== "workspace") {
    return singleTab(value.id, kind);
  }

  const columns = parseColumns(value.columns);
  // Старый файл хранил «Новая вкладка»: у пустой вкладки подпись больше
  // не читается из файла, иначе она пережила бы смену языка.
  const title =
    columns.length === 0 || typeof value.title !== "string" ? "" : value.title;
  const icon = typeof value.icon === "string" && value.icon ? value.icon : EMPTY_TAB_ICON;

  return {
    id: value.id,
    kind,
    title,
    icon,
    columns,
  };
}

/** Собирает одиночную вкладку по виду. */
function singleTab(id: string, kind: SingletonKind): WorkspaceTab {
  const meta = SINGLETON_TABS[kind];
  return {
    id,
    kind,
    title: "",
    icon: meta.icon,
    columns: [],
  };
}

/** Разобранный файл вместе с замечаниями, которые нужно показать в журнале. */
interface ParsedWorkspace {
  file: WorkspaceFile;
  warnings: JournalFact[];
}

/** Причина, по которой файл не восстановлен: код словаря и данные. */
type WorkspaceFault = JournalFact;

/** Замечание о связках: код словаря и данные подстановки. */
type BindingsWarning = JournalFact;

/**
 * Разбирает секцию связок.
 *
 * Одна испорченная связка не отменяет остальные: вкладки всё равно должны
 * открыться. Секции может не быть — так выглядит файл, записанный до
 * появления привязок, и это не поломка.
 */
function parseBindings(value: unknown): {
  entries: Record<string, Binding>;
  warning: BindingsWarning | null;
} {
  if (value === undefined) return { entries: {}, warning: null };
  if (!isRecord(value)) {
    return {
      entries: {},
      warning: { code: "journal.workspace.bindingsNotObject", params: {} },
    };
  }

  const entries: Record<string, Binding> = {};
  let skipped = 0;

  for (const [tabId, item] of Object.entries(value)) {
    if (!isRecord(item)) {
      skipped += 1;
      continue;
    }

    const { templateId, templateRev, layoutRev } = item;
    if (
      typeof templateId !== "string" ||
      !templateId ||
      typeof templateRev !== "string" ||
      !templateRev ||
      typeof layoutRev !== "string" ||
      !layoutRev
    ) {
      skipped += 1;
      continue;
    }

    entries[tabId] = { templateId, templateRev, layoutRev };
  }

  return {
    entries,
    warning: skipped
      ? { code: "journal.workspace.bindingsSkipped", params: { count: skipped } }
      : null,
  };
}

/**
 * Разбирает содержимое файла.
 *
 * Возвращает либо готовое состояние, либо причину отказа строкой. Повторные
 * идентификаторы и вторые экземпляры журнала/настроек отбрасываются: иначе
 * полоса вкладок и правила `openSingleton` разошлись бы с файлом.
 */
function parseFile(stored: unknown): ParsedWorkspace | WorkspaceFault {
  if (!isRecord(stored)) {
    return { code: "journal.workspace.notObject", params: {} };
  }

  if (stored.version !== WORKSPACE_VERSION) {
    return {
      code: "journal.workspace.version",
      params: { version: String(stored.version ?? ""), expected: WORKSPACE_VERSION },
    };
  }

  if (!Array.isArray(stored.tabs)) {
    return { code: "journal.workspace.noTabs", params: {} };
  }

  const tabs: WorkspaceTab[] = [];
  const ids = new Set<string>();
  const singletons = new Set<SingletonKind>();

  for (const item of stored.tabs) {
    const tab = parseTab(item);
    if (!tab) continue;
    if (ids.has(tab.id)) continue;
    if (tab.kind !== "workspace") {
      if (singletons.has(tab.kind)) continue;
      singletons.add(tab.kind);
    }
    ids.add(tab.id);
    tabs.push(tab);
  }

  const parsedBindings = parseBindings(stored.bindings);
  const bindings: Record<string, Binding> = {};
  for (const [tabId, binding] of Object.entries(parsedBindings.entries)) {
    // Связка без вкладки — след падения между записью и очисткой.
    if (ids.has(tabId)) bindings[tabId] = binding;
  }

  const warnings: JournalFact[] = [];
  if (parsedBindings.warning) {
    warnings.push(parsedBindings.warning);
  }

  return {
    file: {
      version: WORKSPACE_VERSION,
      tabs,
      activeId: typeof stored.activeId === "string" ? stored.activeId : "",
      bindings,
    },
    warnings,
  };
}

/**
 * Восстанавливает вкладки из файла.
 *
 * Отсутствие файла — первый запуск, а не повод для записи в журнал. Любая
 * другая поломка объясняется в журнале: пользователь должен понимать, почему
 * вместо его вкладок открылась пустая.
 */
async function restore(): Promise<void> {
  let stored: unknown;

  try {
    stored = await invoke<unknown>("workspace_load");
  } catch (error) {
    templateBindings.reset({});
    write(JOURNAL_CORE_SOURCE, "error", "journal.workspace.readError", {
      reason: error,
    });
    return;
  }

  if (stored === null) {
    templateBindings.reset({});
    return;
  }

  const parsed = parseFile(stored);
  if (!("file" in parsed)) {
    templateBindings.reset({});
    write(JOURNAL_CORE_SOURCE, "error", parsed.code, parsed.params);
    return;
  }

  for (const warning of parsed.warnings) {
    write(JOURNAL_CORE_SOURCE, "error", warning.code, warning.params);
  }

  workspace.tabs = parsed.file.tabs;
  templateBindings.reset(parsed.file.bindings);
  workspace.activeId = parsed.file.tabs.some((tab) => tab.id === parsed.file.activeId)
    ? parsed.file.activeId
    : (parsed.file.tabs[0]?.id ?? "");
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
    bindings: templateBindings.snapshot(),
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
  // Связки — отдельное состояние: правка вкладки и смена связки пишутся
  // одним файлом, поэтому обе подписки ведут к той же отложенной записи.
  const stopBindingsWatch = watch(templateBindings.bindings, scheduleSave, {
    deep: true,
  });
  persistenceStarted = true;

  return () => {
    persistenceStarted = false;
    stopWatch();
    stopBindingsWatch();
    unlisten();
  };
}

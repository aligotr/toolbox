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
import type { Template } from "../contracts/templates";
import type { ToolDescriptor } from "../contracts/tools";
import type {
  Binding,
  SingletonKind,
  TabColumn,
  WorkspaceFile,
  WorkspaceTab,
} from "../contracts/workspace";
import {
  EMPTY_TAB_ICON,
  EMPTY_TAB_TITLE,
  JOURNAL_CORE_SOURCE,
  SINGLETON_TABS,
  TEMPLATE_TAB_ICON,
  WORKSPACE_CLOSE_TIMEOUT_MS,
  WORKSPACE_SAVE_DELAY_MS,
  WORKSPACE_VERSION,
} from "./constants";
import { describeError } from "./errors";
import { write } from "./journal";
import { copyColumns, isRecord, parseColumns } from "./layout";
import * as templateBindings from "./templates/bindings";

/** Состояние рабочего пространства. */
export interface WorkspaceState {
  tabs: WorkspaceTab[];
  /** Идентификатор активной вкладки; пустая строка — вкладок ещё нет. */
  activeId: string;
}

/** Общее состояние рабочего пространства. */
export const workspace = reactive<WorkspaceState>({ tabs: [], activeId: "" });

/** Создаёт новую вкладку и делает её активной. */
function addTab(tab: WorkspaceTab): WorkspaceTab {
  workspace.tabs.push(tab);
  workspace.activeId = tab.id;
  return tab;
}

/** Создаёт пустую вкладку — ту самую «главную», с шаблонами и инструментами. */
export function openEmptyTab(): void {
  addTab({
    id: crypto.randomUUID(),
    kind: "workspace",
    title: EMPTY_TAB_TITLE,
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
    title: meta.title,
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
 * или вида). Подписи одиночных вкладок берутся из реестра, а не из файла:
 * журнал и настройки называются одинаково в любой версии программы.
 */
function parseTab(value: unknown): WorkspaceTab | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || !value.id) return null;

  const kind: unknown = value.kind;
  if (kind !== "workspace" && kind !== "journal" && kind !== "settings") return null;

  if (kind !== "workspace") {
    return singleTab(value.id, kind);
  }

  const title =
    typeof value.title === "string" && value.title ? value.title : EMPTY_TAB_TITLE;
  const icon = typeof value.icon === "string" && value.icon ? value.icon : EMPTY_TAB_ICON;

  return {
    id: value.id,
    kind,
    title,
    icon,
    columns: parseColumns(value.columns),
  };
}

/** Собирает одиночную вкладку по виду. */
function singleTab(id: string, kind: SingletonKind): WorkspaceTab {
  const meta = SINGLETON_TABS[kind];
  return {
    id,
    kind,
    title: meta.title,
    icon: meta.icon,
    columns: [],
  };
}

/** Разобранный файл вместе с замечаниями, которые нужно показать в журнале. */
interface ParsedWorkspace {
  file: WorkspaceFile;
  warnings: string[];
}

/**
 * Разбирает секцию связок.
 *
 * Одна испорченная связка не отменяет остальные: вкладки всё равно должны
 * открыться. Секции может не быть — так выглядит файл, записанный до
 * появления привязок, и это не поломка.
 */
function parseBindings(value: unknown): {
  entries: Record<string, Binding>;
  warning: string | null;
} {
  if (value === undefined) return { entries: {}, warning: null };
  if (!isRecord(value)) {
    return { entries: {}, warning: "секция связок не является объектом" };
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
    warning: skipped ? `пропущено связок: ${skipped}` : null,
  };
}

/**
 * Разбирает содержимое файла.
 *
 * Возвращает либо готовое состояние, либо причину отказа строкой. Повторные
 * идентификаторы и вторые экземпляры журнала/настроек отбрасываются: иначе
 * полоса вкладок и правила `openSingleton` разошлись бы с файлом.
 */
function parseFile(stored: unknown): ParsedWorkspace | string {
  if (!isRecord(stored)) return "ожидался объект";

  if (stored.version !== WORKSPACE_VERSION) {
    return `версия ${String(stored.version)}, ожидалась ${WORKSPACE_VERSION}`;
  }

  if (!Array.isArray(stored.tabs)) return "список вкладок отсутствует";

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

  const warnings: string[] = [];
  if (parsedBindings.warning) {
    warnings.push(
      `связки вкладок не прочитаны полностью: ${parsedBindings.warning}`,
    );
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
    write(
      JOURNAL_CORE_SOURCE,
      "error",
      `рабочее пространство не прочитано: ${describeError(error)}; открыта пустая вкладка`,
    );
    return;
  }

  if (stored === null) {
    templateBindings.reset({});
    return;
  }

  const parsed = parseFile(stored);
  if (typeof parsed === "string") {
    templateBindings.reset({});
    write(
      JOURNAL_CORE_SOURCE,
      "error",
      `рабочее пространство не восстановлено: ${parsed}; открыта пустая вкладка`,
    );
    return;
  }

  for (const warning of parsed.warnings) {
    write(JOURNAL_CORE_SOURCE, "error", warning);
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
      write(
        JOURNAL_CORE_SOURCE,
        "error",
        `рабочее пространство не сохранено: ${describeError(error)}`,
      );
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
        write(
          JOURNAL_CORE_SOURCE,
          "error",
          `рабочее пространство не сохранено при закрытии: ${describeError(error)}`,
        );
      }
    });
  } catch (error) {
    // Без обработчика закрытия остаётся отложенная запись: теряется только
    // последняя правка, сделанная за мгновение до выхода.
    write(
      JOURNAL_CORE_SOURCE,
      "error",
      `обработчик закрытия окна не установлен: ${describeError(error)}`,
    );
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

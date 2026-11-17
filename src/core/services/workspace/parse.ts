// Разбор `local/workspace.json`.
//
// Правила восстановления вкладок отделены от реактивного состояния: файл
// можно разобрать без Vue и Tauri. Поэтому битый документ проверяется тестом,
// а не запуском приложения (ADR 0047).

import type {
  SingletonKind,
  WorkspaceFile,
  WorkspaceTab,
} from "@/contracts/workspace";
import { EMPTY_TAB_ICON, SINGLETON_TABS } from "../../constants";
import { isRecord } from "../../infra/guards";
import { WORKSPACE_VERSION } from "./constants";
import { parseColumns } from "./layout";

/** Причина, по которой файл не восстановлен: код словаря и данные. */
export interface WorkspaceFault {
  code: string;
  params: Record<string, unknown>;
}

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

/**
 * Разбирает содержимое файла.
 *
 * Возвращает либо готовое состояние, либо причину отказа строкой. Повторные
 * идентификаторы и вторые экземпляры журнала/настроек отбрасываются: иначе
 * полоса вкладок и правила `openSingleton` разошлись бы с файлом.
 */
export function parseWorkspaceFile(stored: unknown): WorkspaceFile | WorkspaceFault {
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

  return {
    version: WORKSPACE_VERSION,
    tabs,
    activeId: typeof stored.activeId === "string" ? stored.activeId : "",
  };
}

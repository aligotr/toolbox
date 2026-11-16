// Привязка вкладки к шаблону.
//
// Связка необязательна: вкладка работает и без неё. Она отвечает только
// на вопрос «эта раскладка ещё совпадает с шаблоном?» и не участвует
// в показе инструментов.
//
// Вместо второй копии раскладки хранятся два отпечатка геометрии: вкладки
// и шаблона на момент сверки. Расхождение отпечатков и есть изменение —
// поэтому локальная правка не требует сравнения деревьев, а обновление
// шаблона видно всем вкладкам сразу.
//
// Связки живут в памяти и попадают в `local/workspace.json` вместе
// с вкладками: это часть рабочего места, а не профиля (ADR 0011).

import { reactive } from "vue";
import type { Template } from "./index";
import type { Binding, TabColumn, WorkspaceTab } from "../../../contracts/workspace";
import { TEMPLATE_TAB_ICON } from "../workspace/constants";
import { copyColumns } from "../workspace/layout";
import { templates } from "./index";

/**
 * Состояние связки.
 *
 * `missing` важнее изменений: если шаблон удалён, сравнивать не с чем,
 * и вкладка остаётся рабочей без стрелок и предложений обновить файл.
 */
export type BindingStatus =
  | "none"
  | "clean"
  | "dirty"
  | "outdated"
  | "dirty+outdated"
  | "missing";

/** Связки по идентификатору вкладки; общее состояние рабочего пространства. */
export const bindings = reactive<Record<string, Binding>>({});

/** Связка вкладки; `null` — вкладка собрана вручную. */
export function of(tabId: string): Binding | null {
  return bindings[tabId] ?? null;
}

/**
 * Вычисляет состояние связки.
 *
 * Пока список шаблонов не прочитан, обновление не показывается: стрелка
 * на каждой вкладке при запуске была бы ложной тревогой. Локальные правки
 * видны всегда — для них список шаблонов не нужен.
 */
export function status(tab: WorkspaceTab): BindingStatus {
  const binding = of(tab.id);
  if (!binding) return "none";

  const dirty = hashLayout(tab.columns) !== binding.layoutRev;
  if (!templates.loaded) return dirty ? "dirty" : "clean";

  const template = templates.items.find((item) => item.id === binding.templateId);
  if (!template) return "missing";

  const outdated = hashLayout(template.layout) !== binding.templateRev;
  if (dirty && outdated) return "dirty+outdated";
  if (dirty) return "dirty";
  if (outdated) return "outdated";
  return "clean";
}

/** Есть ли во вкладке правки, которых нет в шаблоне. */
export function hasLocalChanges(state: BindingStatus): boolean {
  return state === "dirty" || state === "dirty+outdated";
}

/** Обновился ли шаблон после того, как вкладка с ним сверялась. */
export function hasUpdate(state: BindingStatus): boolean {
  return state === "outdated" || state === "dirty+outdated";
}

/**
 * Запоминает текущее состояние как исходное.
 *
 * Вызывается после того, как вкладка получила геометрию шаблона: с этого
 * момента обе стороны считаются одинаковыми.
 */
export function capture(tab: WorkspaceTab, template: Template): void {
  store(tab.id, {
    templateId: template.id,
    templateRev: hashLayout(template.layout),
    layoutRev: hashLayout(tab.columns),
  });
}

/**
 * Применяет шаблон к вкладке и сверяет ревизии.
 *
 * Заголовок и иконка берутся из шаблона: вкладка, собранная из него, должна
 * называться так же, иначе после обновления в полосе осталось бы старое имя.
 */
export function apply(tab: WorkspaceTab, template: Template): void {
  tab.title = template.title;
  tab.icon = TEMPLATE_TAB_ICON;
  tab.columns = copyColumns(template.layout);
  capture(tab, template);
}

/** Записывает связку; используется и захватом, и восстановлением из файла. */
export function store(tabId: string, binding: Binding): void {
  bindings[tabId] = { ...binding };
}

/** Открепляет вкладку: шаблон остаётся, вкладка продолжает жить сама. */
export function drop(tabId: string): void {
  delete bindings[tabId];
}

/** Убирает связки закрытых вкладок: файл не должен копить мусор. */
export function prune(validTabIds: ReadonlySet<string>): void {
  for (const tabId of Object.keys(bindings)) {
    if (!validTabIds.has(tabId)) {
      delete bindings[tabId];
    }
  }
}

/** Заменяет все связки содержимым файла при восстановлении. */
export function reset(entries: Record<string, Binding>): void {
  for (const tabId of Object.keys(bindings)) {
    delete bindings[tabId];
  }
  for (const [tabId, binding] of Object.entries(entries)) {
    store(tabId, binding);
  }
}

/** Копия связок для файла: прокси Vue в мост не отдаётся. */
export function snapshot(): Record<string, Binding> {
  const result: Record<string, Binding> = {};
  for (const [tabId, binding] of Object.entries(bindings)) {
    result[tabId] = { ...binding };
  }
  return result;
}

/**
 * Отпечаток геометрии.
 *
 * FNV-1a: короткий, детерминированный и без зависимости от криптографии.
 * Защита от подделки здесь не нужна — отпечаток сравнивает файл с файлом
 * на одной машине.
 */
function hashLayout(columns: TabColumn[]): string {
  const text = columns
    .map((column) => `${column.width}:${column.tools.join(",")}`)
    .join("|");

  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// Связка вкладки с шаблоном в полосе.
//
// Шаблон и расхождения нужны двум местам полосы: признакам вкладки и меню
// действий. Здесь — только вопросы, которые они задают связке; отпечатки
// геометрии и состояния живут в `core/services/templates/bindings`.

import type { Template } from "@/core/services/templates";
import type { WorkspaceTab } from "@/contracts/workspace";
import * as templateBindings from "@/core/services/templates/bindings";
import { templates } from "@/core/services/templates/index";

/** Шаблон по идентификатору вкладки; `null` — связки нет или файл удалён. */
export function templateOf(tabId: string): Template | null {
  const binding = templateBindings.of(tabId);
  if (!binding) return null;
  return templates.items.find((item) => item.id === binding.templateId) ?? null;
}

/** Есть ли во вкладке правки, которых нет в шаблоне. */
export function hasLocalChanges(tab: WorkspaceTab): boolean {
  return templateBindings.hasLocalChanges(templateBindings.status(tab));
}

/** Обновился ли шаблон после последней сверки с вкладкой. */
export function hasUpdate(tab: WorkspaceTab): boolean {
  return templateBindings.hasUpdate(templateBindings.status(tab));
}

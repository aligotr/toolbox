// Закрытие вкладки: вопрос о несохранённых правках и запись в шаблон.
//
// Вкладку без связки и без правок закрываем сразу: лишний вопрос на каждый
// крестик раздражал бы. Если раскладка разошлась с шаблоном, диалог
// спрашивает, что делать с правками (ADR 0011).

import { computed, ref } from "vue";
import type { WorkspaceTab } from "@/contracts/workspace";
import * as templateBindings from "@/core/services/templates/bindings";
import {
  status as templateStatus,
  updateTemplateLayout,
} from "@/core/services/templates/index";
import { closeTab } from "@/core/services/workspace/index";
import { copyColumns } from "@/core/services/workspace/layout";
import { templateOf } from "./templateBinding";

export function useTabClose() {
  const closingTab = ref<WorkspaceTab | null>(null);
  const closeDialogVisible = ref(false);
  const closeSaving = ref(false);
  const closeError = ref<string | null>(null);

  /** Название шаблона закрываемой вкладки; `null` — сохранять некуда. */
  const closingTemplateTitle = computed(() =>
    closingTab.value ? (templateOf(closingTab.value.id)?.title ?? null) : null,
  );

  /**
   * Закрывает вкладку.
   *
   * Если раскладка разошлась с шаблоном, спрашиваем, что делать с правками.
   */
  function requestClose(tab: WorkspaceTab, event?: MouseEvent): void {
    event?.stopPropagation();

    const state = templateBindings.status(tab);
    const needsQuestion =
      templateBindings.hasLocalChanges(state) ||
      (state === "missing" && templateBindings.of(tab.id) !== null);
    if (!needsQuestion) {
      closeTab(tab.id);
      return;
    }

    closingTab.value = tab;
    closeError.value = null;
    closeDialogVisible.value = true;
  }

  /** Закрывает без записи: правки остаются только в закрытой вкладке. */
  function discardAndClose(): void {
    const tab = closingTab.value;
    if (tab) closeTab(tab.id);
    closeDialogVisible.value = false;
    closingTab.value = null;
  }

  /** Записывает правки в шаблон и закрывает вкладку. */
  async function saveAndClose(): Promise<void> {
    const tab = closingTab.value;
    if (!tab) return;

    const binding = templateBindings.of(tab.id);
    if (!binding) {
      discardAndClose();
      return;
    }

    closeSaving.value = true;
    closeError.value = null;
    const updated = await updateTemplateLayout(binding.templateId, copyColumns(tab.columns));
    closeSaving.value = false;

    if (!updated) {
      closeError.value = templateStatus.update.error;
      return;
    }

    discardAndClose();
  }

  return {
    closingTab,
    closeDialogVisible,
    closeSaving,
    closeError,
    closingTemplateTitle,
    requestClose,
    discardAndClose,
    saveAndClose,
  };
}

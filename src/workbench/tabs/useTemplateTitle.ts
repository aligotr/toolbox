// Диалог названия шаблона: сохранение раскладки вкладки и переименование.
//
// Одна форма на две операции: у сохранения и переименования общие поля,
// проверка и ожидание записи. Различаются заголовок, подпись кнопки и то,
// какое состояние операции показывает ошибку (ADR 0032).

import { computed, ref } from "vue";
import type { Template } from "@/core/services/templates";
import type { WorkspaceTab } from "@/contracts/workspace";
import { t } from "@/core/infra/i18n";
import * as templateBindings from "@/core/services/templates/bindings";
import {
  createTemplate,
  renameTemplate,
  status as templateStatus,
} from "@/core/services/templates/index";
import { copyColumns } from "@/core/services/workspace/layout";

/** Режим диалога названия шаблона. */
export type TitleDialogMode = "create" | "rename";

export function useTemplateTitle() {
  const titleDialogVisible = ref(false);
  const titleDialogMode = ref<TitleDialogMode>("create");
  const titleDialogHeader = computed(() =>
    titleDialogMode.value === "rename" ? t("tabs.title.rename") : t("tabs.title.create"),
  );
  const titleDialogSubmit = computed(() =>
    titleDialogMode.value === "rename"
      ? t("tabs.title.renameSubmit")
      : t("tabs.title.createSubmit"),
  );
  const titleDialogNote = computed(() =>
    titleDialogMode.value === "rename" ? t("tabs.title.renameNote") : t("tabs.title.createNote"),
  );
  const titleDialogSuggested = ref("");
  const titleTargetTab = ref<WorkspaceTab | null>(null);
  const titleTargetTemplate = ref<Template | null>(null);

  /** Ошибка берётся из состояния той операции, которую выполняет диалог. */
  const titleDialogError = computed(() =>
    titleDialogMode.value === "rename"
      ? templateStatus.rename.error
      : templateStatus.create.error,
  );

  /** Идёт ли запись: кнопка диалога показывает ожидание. */
  const titleDialogLoading = computed(() =>
    titleDialogMode.value === "rename"
      ? templateStatus.rename.loading
      : templateStatus.create.loading,
  );

  /** Открывает диалог названия: сохранить раскладку или переименовать шаблон. */
  function openTitleDialog(
    mode: TitleDialogMode,
    tab: WorkspaceTab,
    template: Template | null = null,
  ): void {
    titleDialogMode.value = mode;
    titleTargetTab.value = tab;
    titleTargetTemplate.value = template;

    if (mode === "rename" && template) {
      titleDialogSuggested.value = template.title;
      templateStatus.rename.error = null;
    } else {
      titleDialogSuggested.value = tab.title;
      templateStatus.create.error = null;
    }

    titleDialogVisible.value = true;
  }

  /** Выполняет операцию диалога; окно закрывается только при успехе. */
  async function submitTitle(title: string): Promise<void> {
    if (titleDialogMode.value === "rename") {
      const template = titleTargetTemplate.value;
      if (!template) return;
      if (await renameTemplate(template.id, title)) {
        titleDialogVisible.value = false;
      }
      return;
    }

    const tab = titleTargetTab.value;
    if (!tab) return;

    const created = await createTemplate(title, copyColumns(tab.columns));
    if (!created) return;

    // Вкладка запоминает шаблон, который из неё сделали: следующая правка
    // сравнивается уже с ним, а не с прежней привязкой.
    templateBindings.capture(tab, created);
    titleDialogVisible.value = false;
  }

  return {
    titleDialogVisible,
    titleDialogHeader,
    titleDialogSubmit,
    titleDialogNote,
    titleDialogSuggested,
    titleDialogLoading,
    titleDialogError,
    openTitleDialog,
    submitTitle,
  };
}

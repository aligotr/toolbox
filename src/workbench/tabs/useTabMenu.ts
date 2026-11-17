// Меню действий вкладки: пункты и операции над шаблоном.
//
// Меню одно на всю полосу: пункты строятся для вкладки, у которой нажали
// кнопку. Отдельное меню на каждую вкладку плодило бы экземпляры компонента
// ради одного и того же списка.
//
// Обновление и применение шаблона, сохранение, переименование и открепление —
// операции меню. Диалог названия и подтверждение перезапуска приходят
// снаружи: это отдельные сценарии, а меню только предлагает их пунктами.

import type { MenuItem } from "primevue/menuitem";
import { useConfirm } from "primevue/useconfirm";
import { computed, nextTick, ref } from "vue";
import type { Template } from "@/core/services/templates";
import type { WorkspaceTab } from "@/contracts/workspace";
import { CONFIRM_CALM_REJECT } from "@/core/constants";
import { t } from "@/core/infra/i18n";
import * as templateBindings from "@/core/services/templates/bindings";
import { updateTemplateLayout } from "@/core/services/templates/index";
import { workspace } from "@/core/services/workspace/index";
import { copyColumns } from "@/core/services/workspace/layout";
import { hasLocalChanges, templateOf } from "./templateBinding";
import type { TitleDialogMode } from "./useTemplateTitle";
import { tabTitle } from "./title";

/** Сценарии, которые меню предлагает пунктами. */
interface TabMenuActions {
  /** Диалог названия: сохранить раскладку или переименовать шаблон. */
  openTitleDialog: (mode: TitleDialogMode, tab: WorkspaceTab, template?: Template | null) => void;
  /** Перезапуск вкладки с подтверждением. */
  requestRestart: (tab: WorkspaceTab) => void;
}

export function useTabMenu(actions: TabMenuActions) {
  const confirm = useConfirm();

  /** Вкладка, для которой открыто меню действий. */
  const menuTabId = ref<string | null>(null);

  const menuTab = computed(
    () => workspace.tabs.find((tab) => tab.id === menuTabId.value) ?? null,
  );

  /** Связка выбранной вкладки; `null` — вкладка собрана вручную. */
  const menuBinding = computed(() =>
    menuTab.value ? templateBindings.of(menuTab.value.id) : null,
  );

  /** Шаблон выбранной вкладки; `null` — связки нет или файл удалён. */
  const menuTemplate = computed(() =>
    menuTab.value ? templateOf(menuTab.value.id) : null,
  );

  /** Состояние связки выбранной вкладки. */
  const menuState = computed(() =>
    menuTab.value ? templateBindings.status(menuTab.value) : "none",
  );

  /**
   * Пункты меню для выбранной вкладки.
   *
   * У пустой вкладки сохранять нечего, поэтому пункт виден, но недоступен:
   * исчезающий пункт заставил бы искать его в другом месте.
   */
  const menuItems = computed<MenuItem[]>(() => {
    const tab = menuTab.value;
    if (!tab || tab.kind !== "workspace") return [];

    const binding = menuBinding.value;
    const template = menuTemplate.value;
    const state = menuState.value;
    const items: MenuItem[] = [];

    if (binding && template) {
      items.push({
        label: t("tabs.menu.updateTemplate", { title: template.title }),
        icon: "pi pi-save",
        disabled: !templateBindings.hasLocalChanges(state),
        command: () => void updateFromTab(tab, template),
      });
      if (templateBindings.hasUpdate(state)) {
        items.push({
          label: t("tabs.menu.applyUpdate"),
          icon: "pi pi-arrow-circle-down",
          command: () => applyUpdate(tab, template),
        });
      }
      items.push({ separator: true });
    }

    const canSave = tab.columns.length > 0;
    items.push({
      label: canSave
        ? binding
          ? t("tabs.menu.saveNewTemplate")
          : t("tabs.menu.saveTemplate")
        : t("tabs.menu.saveEmpty"),
      icon: "pi pi-file-plus",
      disabled: !canSave,
      command: () => actions.openTitleDialog("create", tab),
    });

    if (binding && template) {
      items.push({
        label: t("tabs.menu.renameTemplate"),
        icon: "pi pi-pencil",
        command: () => actions.openTitleDialog("rename", tab, template),
      });
    }

    if (binding) {
      items.push({
        label: t("tabs.menu.detachTemplate"),
        icon: "pi pi-link",
        command: () => templateBindings.drop(tab.id),
      });
    }

    // Перезапуск стоит последним: он разрушительный и не относится
    // к шаблону, поэтому отделён чертой.
    items.push({ separator: true });
    items.push({
      label: t("tabs.menu.restart"),
      icon: "pi pi-refresh",
      command: () => actions.requestRestart(tab),
    });

    return items;
  });

  /**
   * Запоминает вкладку меню.
   *
   * Ожидание обязательно: меню открывается сразу после выбора, и без
   * пересчёта оно успело бы показать список предыдущей вкладки.
   */
  async function selectMenuTab(tab: WorkspaceTab): Promise<void> {
    menuTabId.value = tab.id;
    await nextTick();
  }

  /** Записывает текущую раскладку вкладки в её шаблон. */
  async function updateFromTab(tab: WorkspaceTab, template: Template): Promise<void> {
    const updated = await updateTemplateLayout(template.id, copyColumns(tab.columns));
    if (updated) {
      // Вкладка сразу сверяется с обновлённым файлом: иначе она показала бы
      // локальные правки поверх только что сохранённой геометрии.
      templateBindings.capture(tab, updated);
    }
  }

  /**
   * Применяет обновлённый шаблон к вкладке.
   *
   * Если вкладку правили локально, раскладка из шаблона затрёт эти правки,
   * поэтому спрашиваем подтверждение: отменить применение будет нечем.
   */
  function applyUpdate(tab: WorkspaceTab, template: Template): void {
    if (hasLocalChanges(tab)) {
      confirm.require({
        header: t("tabs.apply.header"),
        message: t("tabs.apply.message", {
          tab: tabTitle(tab),
          template: template.title,
        }),
        acceptLabel: t("tabs.apply.accept"),
        rejectLabel: t("tabs.apply.reject"),
        rejectProps: CONFIRM_CALM_REJECT,
        accept: () => templateBindings.apply(tab, template),
      });
      return;
    }

    templateBindings.apply(tab, template);
  }

  return { menuItems, selectMenuTab };
}

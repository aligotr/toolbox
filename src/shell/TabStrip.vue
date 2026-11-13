<script setup lang="ts">
// Полоса вкладок.
//
// Вкладка — не пункт меню: её можно закрыть, и она помнит своё место в полосе.
// Журнал и настройки показываются здесь наравне с рабочими вкладками, хотя
// открываются из сайдбара (ADR 0011).
//
// Состояние берётся из `core/workspace`: правила закрытия и активации живут
// там, чтобы одинаково работать и для кнопки, и для будущих горячих клавиш.
// Связка с шаблоном — отдельный слой `core/templates/bindings`: она только
// подсказывает, что раскладка разошлась с шаблоном, и не мешает вкладке жить.
//
// Меню вкладки — одно на всю полосу: пункты строятся для той вкладки, у которой
// нажали кнопку. Отдельное меню на каждую вкладку плодило бы экземпляры
// компонента ради одного и того же списка.

import Button from "primevue/button";
import Menu from "primevue/menu";
import type { MenuItem } from "primevue/menuitem";
import { useConfirm } from "primevue/useconfirm";
import { computed, nextTick, ref } from "vue";
import type { Template } from "../contracts/templates";
import type { WorkspaceTab } from "../contracts/workspace";
import { copyColumns } from "../core/layout";
import {
  createTemplate,
  renameTemplate,
  status as templateStatus,
  templates,
  updateTemplateLayout,
} from "../core/templates";
import * as templateBindings from "../core/templates/bindings";
import { activateTab, closeTab, openEmptyTab, reopenTab, workspace } from "../core/workspace";
import CloseTabDialog from "./CloseTabDialog.vue";
import TemplateTitleDialog from "./TemplateTitleDialog.vue";
import {
  APPLY_TEMPLATE_HEADER,
  APPLY_TEMPLATE_UPDATE_LABEL,
  DETACH_TEMPLATE_LABEL,
  RENAME_TEMPLATE_HEADER,
  RENAME_TEMPLATE_LABEL,
  RENAME_TEMPLATE_NOTE,
  REOPEN_TAB_ACCEPT,
  REOPEN_TAB_HEADER,
  REOPEN_TAB_LABEL,
  REOPEN_TAB_REJECT,
  SAVE_NEW_TEMPLATE_LABEL,
  SAVE_TEMPLATE_EMPTY_HINT,
  SAVE_TEMPLATE_HEADER,
  SAVE_TEMPLATE_LABEL,
  SAVE_TEMPLATE_NOTE,
  TAB_DIRTY_HINT,
  TAB_MENU_TOOLTIP,
  TAB_UPDATE_HINT,
  TEMPLATE_RENAME_SUBMIT,
  TEMPLATE_SAVE_SUBMIT,
  UPDATE_TEMPLATE_LABEL,
} from "./constants";

const confirm = useConfirm();

/** Меню действий; общее для всех вкладок. */
const menu = ref<InstanceType<typeof Menu> | null>(null);

/** Вкладка, для которой открыто меню действий. */
const menuTabId = ref<string | null>(null);

const menuTab = computed(
  () => workspace.tabs.find((tab) => tab.id === menuTabId.value) ?? null,
);

/** Связка выбранной вкладки; `null` — вкладка собрана вручную. */
const menuBinding = computed(() => (menuTab.value ? templateBindings.of(menuTab.value.id) : null));

/** Шаблон выбранной вкладки; `null` — связки нет или файл удалён. */
const menuTemplate = computed(() => (menuTab.value ? templateOf(menuTab.value.id) : null));

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
      label: `${UPDATE_TEMPLATE_LABEL} «${template.title}»`,
      icon: "pi pi-save",
      disabled: !templateBindings.hasLocalChanges(state),
      command: () => void updateFromTab(tab, template),
    });
    if (templateBindings.hasUpdate(state)) {
      items.push({
        label: APPLY_TEMPLATE_UPDATE_LABEL,
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
        ? SAVE_NEW_TEMPLATE_LABEL
        : SAVE_TEMPLATE_LABEL
      : SAVE_TEMPLATE_EMPTY_HINT,
    icon: "pi pi-file-plus",
    disabled: !canSave,
    command: () => openTitleDialog("create", tab),
  });

  if (binding && template) {
    items.push({
      label: RENAME_TEMPLATE_LABEL,
      icon: "pi pi-pencil",
      command: () => openTitleDialog("rename", tab, template),
    });
  }

  if (binding) {
    items.push({
      label: DETACH_TEMPLATE_LABEL,
      icon: "pi pi-link",
      command: () => templateBindings.drop(tab.id),
    });
  }

  // Переоткрытие стоит последним: оно разрушительное и не относится
  // к шаблону, поэтому отделено чертой.
  items.push({ separator: true });
  items.push({
    label: REOPEN_TAB_LABEL,
    icon: "pi pi-refresh",
    command: () => requestReopen(tab),
  });

  return items;
});

/** Шаблон по идентификатору вкладки; `null` — связки нет или файл удалён. */
function templateOf(tabId: string): Template | null {
  const binding = templateBindings.of(tabId);
  if (!binding) return null;
  return templates.items.find((item) => item.id === binding.templateId) ?? null;
}

/** Есть ли во вкладке правки, которых нет в шаблоне. */
function hasLocalChanges(tab: WorkspaceTab): boolean {
  return templateBindings.hasLocalChanges(templateBindings.status(tab));
}

/** Обновился ли шаблон после последней сверки с вкладкой. */
function hasUpdate(tab: WorkspaceTab): boolean {
  return templateBindings.hasUpdate(templateBindings.status(tab));
}

// ─────────────────────────────── Меню вкладки ────────────────────────────────

/**
 * Открывает меню действий у кнопки вкладки.
 *
 * Пункты строятся из выбранной вкладки, поэтому `await nextTick()` обязателен:
 * без него меню успело бы показать список предыдущей вкладки.
 */
async function openMenu(tab: WorkspaceTab, event: MouseEvent): Promise<void> {
  event.stopPropagation();
  menuTabId.value = tab.id;
  await nextTick();
  menu.value?.toggle(event);
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
  if (templateBindings.hasLocalChanges(templateBindings.status(tab))) {
    confirm.require({
      header: APPLY_TEMPLATE_HEADER,
      message:
        `Раскладка вкладки «${tab.title}» изменена. Применение шаблона ` +
        `«${template.title}» заменит её — локальные правки будут потеряны.`,
      acceptLabel: "Применить",
      rejectLabel: "Отмена",
      accept: () => templateBindings.apply(tab, template),
    });
    return;
  }

  templateBindings.apply(tab, template);
}

/**
 * Возвращает инструменты вкладки к состоянию новой.
 *
 * Действие разрушительное: несохранённые строки, результаты и настройки
 * инструментов пропадут, поэтому спрашиваем подтверждение. Сама вкладка
 * остаётся на месте: раскладка и привязка к шаблону переходят к новой копии.
 */
function requestReopen(tab: WorkspaceTab): void {
  confirm.require({
    header: REOPEN_TAB_HEADER,
    message:
      `Инструменты вкладки «${tab.title}» вернутся к состоянию новой: ` +
      "строки, результаты и настройки будут потеряны. Раскладка и привязка " +
      "к шаблону сохранятся.",
    acceptLabel: REOPEN_TAB_ACCEPT,
    rejectLabel: REOPEN_TAB_REJECT,
    accept: () => reopenTab(tab.id),
  });
}

// ─────────────────────────────── Название шаблона ────────────────────────────

type TitleDialogMode = "create" | "rename";

const titleDialogVisible = ref(false);
const titleDialogMode = ref<TitleDialogMode>("create");
const titleDialogHeader = ref(SAVE_TEMPLATE_HEADER);
const titleDialogSubmit = ref(TEMPLATE_SAVE_SUBMIT);
const titleDialogNote = ref(SAVE_TEMPLATE_NOTE);
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
    titleDialogHeader.value = RENAME_TEMPLATE_HEADER;
    titleDialogSubmit.value = TEMPLATE_RENAME_SUBMIT;
    titleDialogNote.value = RENAME_TEMPLATE_NOTE;
    titleDialogSuggested.value = template.title;
    templateStatus.rename.error = null;
  } else {
    titleDialogHeader.value = SAVE_TEMPLATE_HEADER;
    titleDialogSubmit.value = TEMPLATE_SAVE_SUBMIT;
    titleDialogNote.value = SAVE_TEMPLATE_NOTE;
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

// ─────────────────────────────── Закрытие вкладки ────────────────────────────

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
 * Вкладку без связки и без правок закрываем сразу: лишний вопрос на каждый
 * крестик раздражал бы.
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

/** Активация с клавиатуры: вкладка — не кнопка, но ведёт себя как кнопка. */
function activateFromKeyboard(tabId: string, event: KeyboardEvent): void {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    activateTab(tabId);
  }
}
</script>

<template>
  <nav class="tabs" aria-label="Вкладки">
    <div class="tabs__list" role="tablist">
      <div
        v-for="tab in workspace.tabs"
        :key="tab.id"
        class="tab"
        :class="{ 'tab--active': tab.id === workspace.activeId }"
        role="tab"
        :aria-selected="tab.id === workspace.activeId"
        tabindex="0"
        @click="activateTab(tab.id)"
        @keydown="activateFromKeyboard(tab.id, $event)"
      >
        <i class="tab__icon" :class="tab.icon" aria-hidden="true" />
        <span class="tab__title">{{ tab.title }}</span>

        <i
          v-if="tab.kind === 'workspace' && hasLocalChanges(tab)"
          class="tab__marker tab__marker--dot pi pi-circle-fill"
          role="img"
          :aria-label="TAB_DIRTY_HINT"
          v-tooltip.bottom="TAB_DIRTY_HINT"
        />
        <i
          v-if="tab.kind === 'workspace' && hasUpdate(tab)"
          class="tab__marker tab__marker--update pi pi-arrow-circle-up"
          role="img"
          :aria-label="TAB_UPDATE_HINT"
          v-tooltip.bottom="TAB_UPDATE_HINT"
        />

        <button
          v-if="tab.kind === 'workspace'"
          class="tab__menu"
          type="button"
          :aria-label="`Действия с вкладкой «${tab.title}»`"
          v-tooltip.bottom="TAB_MENU_TOOLTIP"
          @click="openMenu(tab, $event)"
        >
          <i class="pi pi-ellipsis-v" aria-hidden="true" />
        </button>
        <button
          class="tab__close"
          type="button"
          :aria-label="`Закрыть вкладку «${tab.title}»`"
          v-tooltip.bottom="'Закрыть вкладку'"
          @click="requestClose(tab, $event)"
        >
          <i class="pi pi-times" aria-hidden="true" />
        </button>
      </div>
    </div>

    <Button
      class="tabs__add"
      icon="pi pi-plus"
      text
      rounded
      size="small"
      aria-label="Новая вкладка"
      v-tooltip.bottom="'Новая вкладка'"
      @click="openEmptyTab"
    />

    <Menu ref="menu" :model="menuItems" popup />

    <TemplateTitleDialog
      v-model:visible="titleDialogVisible"
      :header="titleDialogHeader"
      :submit-label="titleDialogSubmit"
      :note="titleDialogNote"
      :suggested-title="titleDialogSuggested"
      :loading="titleDialogLoading"
      :error="titleDialogError"
      @save="submitTitle"
    />

    <CloseTabDialog
      v-model:visible="closeDialogVisible"
      :tab-title="closingTab?.title ?? ''"
      :template-title="closingTemplateTitle"
      :saving="closeSaving"
      :error="closeError"
      @save="saveAndClose"
      @discard="discardAndClose"
    />
  </nav>
</template>

<style scoped>
.tabs {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: var(--ag-space-sm);
  height: 48px;
  padding: var(--ag-space-sm);
  background: var(--ag-bg);
  border-bottom: 1px solid var(--ag-border);
}

.tabs__list {
  display: flex;
  flex: 0 1 auto;
  gap: var(--ag-space-sm);
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.tabs__list::-webkit-scrollbar {
  display: none;
}

.tab {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: var(--ag-space-sm);
  height: 32px;
  max-width: 240px;
  padding: 0 var(--ag-space-sm);
  border-radius: var(--ag-radius-md);
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-sm);
  cursor: pointer;
  user-select: none;
}

.tab:hover {
  background: var(--ag-hover);
  color: var(--p-text-color);
}

.tab--active {
  background: var(--ag-surface);
  color: var(--p-text-color);
}

.tab:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.tab__icon {
  flex-shrink: 0;
  font-size: 14px;
}

.tab__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Маркеры не отнимают место у заголовка: они уже иконок. */
.tab__marker {
  flex-shrink: 0;
}

.tab__marker--dot {
  color: var(--p-text-muted-color);
  font-size: 6px;
}

.tab__marker--update {
  color: var(--p-primary-color);
  font-size: 12px;
}

.tab__menu,
.tab__close {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: var(--ag-radius-sm);
  background: transparent;
  color: inherit;
  font-size: 11px;
  cursor: pointer;
}

.tab__menu:hover,
.tab__close:hover {
  background: var(--ag-hover);
}

.tab__menu:focus-visible,
.tab__close:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.tabs__add {
  flex-shrink: 0;
}
</style>

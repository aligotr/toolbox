<script setup lang="ts">
// Полоса вкладок.
//
// Вкладка — не пункт меню: её можно закрыть, и она помнит своё место в полосе.
// Журнал и настройки показываются здесь наравне с рабочими вкладками, хотя
// открываются из сайдбара (ADR 0011).
//
// Состояние берётся из `core/services/workspace`: правила закрытия
// и активации живут там, чтобы одинаково работать и для кнопки, и для будущих
// горячих клавиш. Связка с шаблоном — отдельный модуль
// `core/services/templates/bindings`: она только подсказывает, что раскладка
// разошлась с шаблоном, и не мешает вкладке жить.
//
// Меню вкладки — одно на всю полосу: пункты строятся для той вкладки, у которой
// нажали кнопку. Отдельное меню на каждую вкладку плодило бы экземпляры
// компонента ради одного и того же списка.

import Button from "primevue/button";
import Menu from "primevue/menu";
import type { MenuItem } from "primevue/menuitem";
import { useConfirm } from "primevue/useconfirm";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { Template } from "@/core/services/templates";
import type { WorkspaceTab } from "@/contracts/workspace";
import { CONFIRM_CALM_REJECT } from "@/core/constants";
import { t } from "@/core/infra/i18n";
import { copyColumns } from "@/core/services/workspace/layout";
import { defaultPresetTitle, loadPresetDefaults } from "@/core/services/presets/index";
import {
  createTemplate,
  renameTemplate,
  status as templateStatus,
  templates,
  updateTemplateLayout,
} from "@/core/services/templates/index";
import * as templateBindings from "@/core/services/templates/bindings";
import {
  activateTab,
  closeTab,
  focusTick,
  openEmptyTab,
  restartTab,
  workspace,
} from "@/core/services/workspace/index";
import CloseTabDialog from "./CloseTabDialog.vue";
import TemplateTitleDialog from "./TemplateTitleDialog.vue";
import { tabTitle } from "./title";

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
    command: () => openTitleDialog("create", tab),
  });

  if (binding && template) {
    items.push({
      label: t("tabs.menu.renameTemplate"),
      icon: "pi pi-pencil",
      command: () => openTitleDialog("rename", tab, template),
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
    command: () => void requestRestart(tab),
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

// ─────────────────────────────── Прокрутка полосы ────────────────────────────

/** Полоса вкладок: по её прокрутке решается, нужны ли шевроны. */
const listEl = ref<HTMLElement | null>(null);

/** Есть ли скрытые вкладки слева и справа. */
const canScrollLeft = ref(false);
const canScrollRight = ref(false);

/** Допуск в пикселях: дробная прокрутка не должна гасить шеврон раньше времени. */
const SCROLL_EPSILON = 1;

/** Доля ширины полосы, на которую сдвигает клик по шеврону. */
const SCROLL_PAGE = 0.8;

/** Ширина кромки, которую шеврон и градиент перекрывают у вкладок. */
const CHEVRON_REACH = 44;

/** Пересчитывает доступность шевронов по текущей прокрутке. */
function updateScrollState(): void {
  const el = listEl.value;
  if (!el) return;
  canScrollLeft.value = el.scrollLeft > SCROLL_EPSILON;
  canScrollRight.value =
    el.scrollLeft + el.clientWidth < el.scrollWidth - SCROLL_EPSILON;
}

/** Сдвигает полосу почти на экран в заданную сторону. */
function scrollTabs(direction: -1 | 1): void {
  const el = listEl.value;
  if (!el) return;
  el.scrollBy({
    left: direction * el.clientWidth * SCROLL_PAGE,
    behavior: "smooth",
  });
}

/**
 * Подкручивает полосу так, чтобы активная вкладка была видна целиком.
 *
 * `scrollIntoView` здесь не годится: кромку, занятую шевроном и градиентом,
 * он считает видимой зоной. Вкладка у кромки формально в прокрутке, но её
 * заголовок прячется под стрелкой — поэтому целимся в кромку с запасом
 * на шеврон, а не в край полосы.
 */
function revealActiveTab(behavior: ScrollBehavior = "smooth"): void {
  const el = listEl.value;
  const tab = el?.querySelector<HTMLElement>(".tab--active");
  if (!el || !tab || el.clientWidth === 0) return;

  // Положение вкладки в координатах содержимого полосы.
  const listRect = el.getBoundingClientRect();
  const tabRect = tab.getBoundingClientRect();
  const start = tabRect.left - listRect.left + el.scrollLeft;
  const end = start + tabRect.width;
  const max = Math.max(el.scrollWidth - el.clientWidth, 0);

  // Вкладка шире видимой зоны: показываем хотя бы её начало.
  const room = Math.max(el.clientWidth - CHEVRON_REACH * 2, 1);
  const fits = end - start <= room;

  let target = el.scrollLeft;
  if (!fits || start - CHEVRON_REACH < el.scrollLeft) {
    target = start - CHEVRON_REACH;
  } else if (end + CHEVRON_REACH > el.scrollLeft + el.clientWidth) {
    target = end + CHEVRON_REACH - el.clientWidth;
  }

  target = Math.min(Math.max(target, 0), max);
  if (Math.abs(target - el.scrollLeft) < SCROLL_EPSILON) return;
  el.scrollTo({ left: target, behavior });
}

/** Ширина полосы меняется от окна и сайдбара, а не только от прокрутки. */
let listResize: ResizeObserver | null = null;

onMounted(async () => {
  updateScrollState();
  if (!listEl.value) return;
  listResize = new ResizeObserver(() => updateScrollState());
  listResize.observe(listEl.value);

  // Восстановленное рабочее место могло оставить активную вкладку за кромкой.
  await nextTick();
  revealActiveTab("auto");
});

onBeforeUnmount(() => {
  listResize?.disconnect();
  listResize = null;
});

// Число вкладок меняет ширину содержимого, но не ширину самой полосы.
watch(
  () => workspace.tabs.length,
  async () => {
    await nextTick();
    updateScrollState();
  },
);

// Активная вкладка не должна оставаться за кромкой: иначе выбор инструмента
// в сайдбаре выглядел бы как «ничего не произошло». Сигнал срабатывает и на
// повторный выбор уже активной вкладки.
watch(focusTick, async () => {
  await nextTick();
  revealActiveTab();
});

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

/**
 * Пресеты по умолчанию для инструментов вкладки.
 *
 * Одинаковые названия повторяются один раз: в подтверждении важен список
 * пресетов, а не число ячеек.
 */
function defaultTitlesOf(tab: WorkspaceTab): string[] {
  const titles = tab.columns
    .flatMap((column) => column.tools)
    .map((tool) => defaultPresetTitle(tool))
    .filter((title): title is string => title !== null);
  return [...new Set(titles)];
}

/**
 * Строка о пресетах по умолчанию: какие из них загрузятся после перезапуска.
 *
 * Упоминаются только заданные умолчания — иначе подсказка обещала бы пресет,
 * которого нет. `null` — умолчаний нет, строки в подтверждении не будет.
 */
function restartDefaultsLine(titles: string[]): string | null {
  if (titles.length === 0) return null;
  if (titles.length === 1) return t("tabs.restart.presetOne", { title: titles[0] });
  return t("tabs.restart.presets", { titles: titles.join(", ") });
}

/**
 * Возвращает инструменты вкладки к состоянию новой.
 *
 * Действие разрушительное: несохранённые строки, результаты и настройки
 * инструментов пропадут, поэтому спрашиваем подтверждение. Сама вкладка
 * остаётся на месте: раскладка и привязка к шаблону переходят к новой копии.
 */
async function requestRestart(tab: WorkspaceTab): Promise<void> {
  // Названия умолчаний известны только после чтения списков: без него
  // подтверждение не смогло бы сказать, какой пресет загрузится.
  await loadPresetDefaults();

  const lines = [t("tabs.restart.loss")];
  const defaults = restartDefaultsLine(defaultTitlesOf(tab));
  if (defaults !== null) lines.push(defaults);
  lines.push(t("tabs.restart.keep"));

  confirm.require({
    header: t("tabs.restart.header"),
    message: lines.join("\n"),
    acceptLabel: t("tabs.restart.accept"),
    rejectLabel: t("tabs.restart.reject"),
    rejectProps: CONFIRM_CALM_REJECT,
    accept: () => restartTab(tab.id),
  });
}

// ─────────────────────────────── Название шаблона ────────────────────────────

type TitleDialogMode = "create" | "rename";

const titleDialogVisible = ref(false);
const titleDialogMode = ref<TitleDialogMode>("create");
const titleDialogHeader = computed(() =>
  titleDialogMode.value === "rename" ? t("tabs.title.rename") : t("tabs.title.create"),
);
const titleDialogSubmit = computed(() =>
  titleDialogMode.value === "rename" ? t("tabs.title.renameSubmit") : t("tabs.title.createSubmit"),
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
  <nav class="tabs" :aria-label="t('tabs.strip.label')">
    <div class="tabs__viewport">
      <div
        ref="listEl"
        class="tabs__list"
        role="tablist"
        @scroll.passive="updateScrollState"
      >
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
          <span class="tab__title">{{ tabTitle(tab) }}</span>

          <i
            v-if="tab.kind === 'workspace' && hasLocalChanges(tab)"
            class="tab__marker tab__marker--dot pi pi-circle-fill"
            role="img"
            :aria-label="t('tabs.tab.dirtyHint')"
            v-tooltip.bottom="t('tabs.tab.dirtyHint')"
          />
          <i
            v-if="tab.kind === 'workspace' && hasUpdate(tab)"
            class="tab__marker tab__marker--update pi pi-arrow-circle-up"
            role="img"
            :aria-label="t('tabs.tab.updateHint')"
            v-tooltip.bottom="t('tabs.tab.updateHint')"
          />

          <button
            v-if="tab.kind === 'workspace'"
            class="tab__menu"
            type="button"
            :aria-label="t('tabs.tab.menuTitle', { title: tabTitle(tab) })"
            v-tooltip.bottom="t('tabs.tab.menu')"
            @click="openMenu(tab, $event)"
          >
            <i class="pi pi-ellipsis-v" aria-hidden="true" />
          </button>
          <button
            class="tab__close"
            type="button"
            :aria-label="t('tabs.tab.closeTitle', { title: tabTitle(tab) })"
            v-tooltip.bottom="t('tabs.tab.close')"
            @click="requestClose(tab, $event)"
          >
            <i class="pi pi-times" aria-hidden="true" />
          </button>
        </div>
      </div>

      <button
        v-show="canScrollLeft"
        class="tabs__scroll tabs__scroll--left"
        type="button"
        :aria-label="t('tabs.scroll.left')"
        @click="scrollTabs(-1)"
      >
        <i class="pi pi-angle-left" aria-hidden="true" />
      </button>
      <button
        v-show="canScrollRight"
        class="tabs__scroll tabs__scroll--right"
        type="button"
        :aria-label="t('tabs.scroll.right')"
        @click="scrollTabs(1)"
      >
        <i class="pi pi-angle-right" aria-hidden="true" />
      </button>
    </div>

    <Button
      class="tabs__add"
      icon="pi pi-plus"
      text
      rounded
      size="small"
      :aria-label="t('tab.empty.title')"
      v-tooltip.bottom="t('tab.empty.title')"
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
      :tab-title="closingTab ? tabTitle(closingTab) : ''"
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

.tabs__viewport {
  position: relative;
  display: flex;
  flex: 0 1 auto;
  min-width: 0;
}

.tabs__list {
  display: flex;
  flex: 1 1 auto;
  gap: var(--ag-space-sm);
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.tabs__list::-webkit-scrollbar {
  display: none;
}

/* Шеврон лежит поверх полосы: место у вкладок не отнимается. Градиент
   под ним показывает, что за кромкой есть продолжение. */
.tabs__scroll {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 1;
  display: grid;
  align-items: center;
  width: 44px;
  padding: 0;
  border: 0;
  color: var(--p-text-muted-color);
  cursor: pointer;
}

.tabs__scroll--left {
  left: 0;
  justify-items: start;
  padding-left: var(--ag-space-xs);
  background: linear-gradient(to right, var(--ag-bg) 60%, transparent);
}

.tabs__scroll--right {
  right: calc(-1 * var(--ag-space-xs));
  justify-items: end;
  padding-right: 0;
  background: linear-gradient(to left, var(--ag-bg) 60%, transparent);
}

.tabs__scroll i {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: var(--ag-radius-md);
  font-size: 14px;
}

.tabs__scroll:hover i {
  background: var(--ag-hover);
  color: var(--p-text-color);
}

.tabs__scroll:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: -2px;
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

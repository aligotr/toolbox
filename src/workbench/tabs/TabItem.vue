<script setup lang="ts">
// Вкладка полосы: значок, заголовок, признаки расхождения и кнопки действий.
//
// Вкладка — не кнопка, но ведёт себя как кнопка: активация мышью и с
// клавиатуры. Меню и закрытие здесь только сообщаются наружу: правила живут
// в полосе, а вкладка остаётся представлением.

import type { WorkspaceTab } from "@/contracts/workspace";
import { t } from "@/core/infra/i18n";
import { tabTitle } from "./title";

defineProps<{
  tab: WorkspaceTab;
  /** Вкладка открыта в рабочем пространстве. */
  active: boolean;
  /** В раскладке есть правки, которых нет в шаблоне. */
  dirty: boolean;
  /** Шаблон обновился после последней сверки с вкладкой. */
  updateAvailable: boolean;
}>();

const emit = defineEmits<{
  activate: [];
  menu: [event: MouseEvent];
  close: [event: MouseEvent];
}>();

/** Активация с клавиатуры: вкладка — не кнопка, но ведёт себя как кнопка. */
function activateFromKeyboard(event: KeyboardEvent): void {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    emit("activate");
  }
}
</script>

<template>
  <div
    class="tab"
    :class="{ 'tab--active': active }"
    role="tab"
    :aria-selected="active"
    tabindex="0"
    @click="emit('activate')"
    @keydown="activateFromKeyboard"
  >
    <i class="tab__icon" :class="tab.icon" aria-hidden="true" />
    <span class="tab__title">{{ tabTitle(tab) }}</span>

    <i
      v-if="tab.kind === 'workspace' && dirty"
      class="tab__marker tab__marker--dot pi pi-circle-fill"
      role="img"
      :aria-label="t('tabs.tab.dirtyHint')"
      v-tooltip.bottom="t('tabs.tab.dirtyHint')"
    />
    <i
      v-if="tab.kind === 'workspace' && updateAvailable"
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
      @click.stop="emit('menu', $event)"
    >
      <i class="pi pi-ellipsis-v" aria-hidden="true" />
    </button>
    <button
      class="tab__close"
      type="button"
      :aria-label="t('tabs.tab.closeTitle', { title: tabTitle(tab) })"
      v-tooltip.bottom="t('tabs.tab.close')"
      @click.stop="emit('close', $event)"
    >
      <i class="pi pi-times" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
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
</style>

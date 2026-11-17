<script setup lang="ts">
// Вкладка полосы: значок, заголовок и кнопки действий.
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
}>();

const emit = defineEmits<{
  activate: [];
  menu: [event: MouseEvent];
  close: [];
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
      @click.stop="emit('close')"
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

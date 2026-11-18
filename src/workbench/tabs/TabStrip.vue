<script setup lang="ts">
// Полоса вкладок.
//
// Вкладка — не пункт меню: её можно закрыть, и она помнит своё место в полосе.
// Журнал и настройки показываются здесь наравне с рабочими вкладками, хотя
// открываются из сайдбара (ADR 0011).
//
// Состояние берётся из `core/services/workspace`: правила закрытия
// и активации живут там, чтобы одинаково работать и для кнопки, и для будущих
// горячих клавиш. Прокрутка живёт в соседнем композабле; компонент отвечает
// за раскладку полосы и связывает состояние с разметкой.

import Button from "primevue/button";
import { ref } from "vue";
import { t } from "@/core/infra/i18n";
import { activateTab, closeTab, openEmptyTab, workspace } from "@/core/services/workspace/index";
import TabItem from "./TabItem.vue";
import { useStripScroll } from "./useStripScroll";

/** Полоса вкладок: по её прокрутке решается, нужны ли шевроны. */
const listEl = ref<HTMLElement | null>(null);

/** Активная вкладка в разметке: к ней подкручивается полоса. */
function activeTabEl(): HTMLElement | null {
  return listEl.value?.querySelector<HTMLElement>(".tab--active") ?? null;
}

const { canScrollLeft, canScrollRight, scrollTabs, updateScrollState } = useStripScroll(
  listEl,
  activeTabEl,
);
</script>

<template>
  <nav class="tabs" :aria-label="t('tabs.strip.label')">
    <div class="tabs__viewport">
      <div ref="listEl" class="tabs__list" role="tablist" @scroll.passive="updateScrollState">
        <TabItem
          v-for="tab in workspace.tabs"
          :key="tab.id"
          :tab="tab"
          :active="tab.id === workspace.activeId"
          @activate="activateTab(tab.id)"
          @close="closeTab(tab.id)"
        />
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

.tabs__add {
  flex-shrink: 0;
}
</style>

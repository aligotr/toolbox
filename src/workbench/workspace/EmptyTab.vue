<script setup lang="ts">
// Пустая вкладка — «главная» рабочего пространства.
//
// Отдельного экрана «Главная» нет: при запуске и по кнопке «плюс» открывается
// вкладка, на которой видно, из чего собрать рабочее место (ADR 0011).
//
// Карточек здесь только инструменты: выбрать больше нечего.

import type { ToolDescriptor } from "@/contracts/tools";
import type { StartupStatus } from "@/core/services/startup";
import { t } from "@/core/infra/i18n";
import { openToolOnAuxClick, openToolOnClick, openToolOnKeydown } from "../toolGestures";

defineProps<{ tools: ToolDescriptor[]; startup: StartupStatus | null }>();
</script>

<template>
  <section class="empty">
    <header class="wb-screen__head">
      <h1 class="wb-screen__title">{{ t("workspace.empty.title") }}</h1>
      <p class="wb-screen__lead">{{ t("workspace.empty.lead") }}</p>
    </header>

    <section class="wb-section">
      <h2 class="wb-section__title">{{ t("workspace.empty.tools") }}</h2>

      <div v-if="tools.length" class="empty__tools">
        <button
          v-for="tool in tools"
          :key="tool.id"
          class="action-card"
          type="button"
          v-tooltip.bottom="{
            value: t('tools.open.anotherTab'),
            disabled: !tool.multipleTabs,
          }"
          @click="openToolOnClick(tool, $event)"
          @auxclick="openToolOnAuxClick(tool, $event)"
          @keydown="openToolOnKeydown(tool, $event)"
        >
          <i class="action-card__icon" :class="tool.icon" aria-hidden="true" />
          <span class="action-card__text">
            <strong class="action-card__title">{{ tool.title }}</strong>
            <small v-if="tool.descriptionKey" class="action-card__note">
              {{ t(tool.descriptionKey) }}
            </small>
          </span>
        </button>
      </div>

      <p v-else class="empty__note">{{ t("workspace.empty.toolsNone") }}</p>
    </section>

    <footer class="empty__status">
      <span class="status__dot" :class="{ 'status__dot--off': !startup }" aria-hidden="true" />
      <span>{{ startup ? t("workspace.empty.coreOn") : t("workspace.empty.coreOff") }}</span>
      <span v-if="startup" class="status__path">{{ startup.root }}</span>
    </footer>
  </section>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-2xl);
  height: 100%;
  max-width: var(--ag-content-catalog);
  margin: 0 auto;
  padding: var(--ag-space-lg);
  overflow: auto;
}

/* Карточка-действие: иконка и подпись инструмента. */
.action-card {
  display: flex;
  align-items: flex-start;
  gap: var(--ag-space-lg);
  padding: var(--ag-space-lg);
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-md);
  background: var(--ag-surface);
  color: var(--p-text-color);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.action-card:hover {
  border-color: var(--ag-border-strong);
}

.action-card:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.action-card__text {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-xs);
  min-width: 0;
}

.action-card__title {
  overflow: hidden;
  font-size: var(--ag-text-md);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-card__note {
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.action-card__icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--p-primary-color);
  font-size: 18px;
}

.empty__tools {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--ag-space-lg);
}

.empty__note {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-sm);
}

.empty__status {
  display: flex;
  align-items: center;
  gap: var(--ag-space-sm);
  min-width: 0;
  margin-top: auto;
  padding-top: var(--ag-space-lg);
  border-top: 1px solid var(--ag-border);
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.status__dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: var(--ag-radius-round);
  background: var(--ag-ok);
}

.status__dot--off {
  background: var(--p-surface-400);
}

.status__path {
  overflow: hidden;
  font-family: var(--ag-font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

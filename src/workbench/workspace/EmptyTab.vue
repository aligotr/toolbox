<script setup lang="ts">
// Пустая вкладка — «главная» рабочего пространства.
//
// Отдельного экрана «Главная» нет: при запуске и по кнопке «плюс» открывается
// вкладка, на которой видно, из чего собрать рабочее место (ADR 0011).
//
// Карточка шаблона показывает миниатюру раскладки: по названию не понять,
// что внутри, а открывать шаблон ради проверки — потеря времени. Нажатие
// заполняет текущую пустую вкладку; если она уже занята, шаблон открывается
// новой — иначе стёрлась бы текущая работа.
//
// Обе карточки — одно действие с разным содержимым, поэтому база у них общая:
// `action-card` и модификатор раскладки (ADR 0037).

import type { Template } from "@/core/services/templates";
import type { ToolDescriptor } from "@/contracts/tools";
import type { StartupStatus } from "@/core/services/startup";
import { t } from "@/core/infra/i18n";
import { applyTemplate, openTemplate, openTool, workspace } from "@/core/services/workspace/index";
import { templates, status as templateStatus } from "@/core/services/templates/index";
import { toolsLabel } from "../plural";

defineProps<{ tools: ToolDescriptor[]; startup: StartupStatus | null }>();

/** Сколько инструментов в шаблоне: подпись под названием. */
function toolCount(template: Template): number {
  return template.layout.reduce((sum, column) => sum + column.tools.length, 0);
}

/** Применяет шаблон к текущей вкладке; занятую вкладку не трогает. */
function useTemplate(template: Template): void {
  if (!applyTemplate(workspace.activeId, template)) {
    openTemplate(template);
  }
}
</script>

<template>
  <section class="empty">
    <header class="wb-screen__head">
      <h1 class="wb-screen__title">{{ t("workspace.empty.title") }}</h1>
      <p class="wb-screen__lead">{{ t("workspace.empty.lead") }}</p>
    </header>

    <section class="wb-section">
      <h2 class="wb-section__title">{{ t("workspace.empty.templates") }}</h2>

      <p v-if="templateStatus.list.error" class="empty__note empty__note--error">
        {{ t("workspace.empty.templatesError", { reason: templateStatus.list.error }) }}
      </p>

      <div v-else-if="templates.items.length" class="empty__templates">
        <button
          v-for="template in templates.items"
          :key="template.id"
          class="action-card action-card--template"
          type="button"
          @click="useTemplate(template)"
        >
          <span class="action-card__preview" aria-hidden="true">
            <span
              v-for="(column, index) in template.layout"
              :key="index"
              class="action-card__column"
              :style="{ flexGrow: column.width }"
            >
              <span
                v-for="(toolId, cellIndex) in column.tools"
                :key="`${toolId}-${cellIndex}`"
                class="action-card__cell"
              />
            </span>
          </span>
          <span class="action-card__text">
            <strong class="action-card__title">{{ template.title }}</strong>
            <small class="action-card__note">{{ toolsLabel(toolCount(template)) }}</small>
          </span>
        </button>
      </div>

      <p v-else class="empty__note">
        {{ t("workspace.empty.templatesNone") }}
      </p>
    </section>

    <section class="wb-section">
      <h2 class="wb-section__title">{{ t("workspace.empty.tools") }}</h2>

      <div v-if="tools.length" class="empty__tools">
        <button
          v-for="tool in tools"
          :key="tool.id"
          class="action-card action-card--tool"
          type="button"
          @click="openTool(tool)"
        >
          <i class="action-card__icon" :class="tool.icon" aria-hidden="true" />
          <span class="action-card__text">
            <strong class="action-card__title">{{ tool.title }}</strong>
            <small v-if="tool.description" class="action-card__note">
              {{ tool.description }}
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
  padding: var(--ag-space-2xl);
  overflow: auto;
}

.empty__templates {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--ag-space-lg);
}

/* Карточка-действие: шаблон и инструмент различаются раскладкой и отступами,
   всё остальное у них общее. */
.action-card {
  display: flex;
  gap: var(--ag-space-sm);
  padding: var(--ag-space-sm);
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

.action-card--template {
  flex-direction: column;
}

.action-card--tool {
  align-items: flex-start;
  gap: var(--ag-space-lg);
  padding: var(--ag-space-lg);
}

/* Миниатюра раскладки: колонки и ячейки в тех же пропорциях, что на вкладке. */
.action-card__preview {
  display: flex;
  gap: var(--ag-space-xs);
  height: 48px;
  padding: var(--ag-space-sm);
  border-radius: var(--ag-radius-sm);
  background: var(--ag-surface-2);
}

.action-card__column {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  gap: var(--ag-space-xs);
  min-width: 0;
}

.action-card__cell {
  flex: 1 1 0;
  min-height: 4px;
  border-radius: 2px;
  background: var(--p-surface-300);
}

.action-card__text {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-xs);
  min-width: 0;
}

.action-card--template .action-card__text {
  padding: 0 var(--ag-space-sm) var(--ag-space-sm);
}

.action-card__title {
  overflow: hidden;
  font-size: var(--ag-text-sm);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-card--tool .action-card__title {
  font-size: var(--ag-text-md);
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

.empty__note--error {
  color: var(--ag-danger);
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

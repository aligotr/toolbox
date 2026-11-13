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

import type { Template } from "../contracts/templates";
import type { ToolDescriptor } from "../contracts/tools";
import type { StartupStatus } from "../core/startup";
import { applyTemplate, openTemplate, openTool, workspace } from "../core/workspace";
import { templates, status as templateStatus } from "../core/templates";
import { toolsLabel } from "./plural";

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
    <header class="empty__head">
      <h1 class="empty__title">Начать с шаблона</h1>
      <p class="empty__lead">
        Выберите заготовку рабочего места или добавьте инструмент — он откроется
        в новой вкладке.
      </p>
    </header>

    <section class="empty__section">
      <h2 class="empty__section-title">Шаблоны вкладок</h2>

      <p v-if="templateStatus.list.error" class="empty__note empty__note--error">
        Шаблоны не прочитаны: {{ templateStatus.list.error }}
      </p>

      <div v-else-if="templates.items.length" class="empty__templates">
        <button
          v-for="template in templates.items"
          :key="template.id"
          class="template-card"
          type="button"
          @click="useTemplate(template)"
        >
          <span class="template-card__preview" aria-hidden="true">
            <span
              v-for="(column, index) in template.layout"
              :key="index"
              class="template-card__column"
              :style="{ flexGrow: column.width }"
            >
              <span
                v-for="(toolId, cellIndex) in column.tools"
                :key="`${toolId}-${cellIndex}`"
                class="template-card__cell"
              />
            </span>
          </span>
          <span class="template-card__text">
            <strong class="template-card__title">{{ template.title }}</strong>
            <small class="template-card__note">{{ toolsLabel(toolCount(template)) }}</small>
          </span>
        </button>
      </div>

      <p v-else class="empty__note">
        Сохранённых шаблонов нет. Соберите вкладку и выберите «Сохранить как
        шаблон» в её меню.
      </p>
    </section>

    <section class="empty__section">
      <h2 class="empty__section-title">Инструменты</h2>

      <div v-if="tools.length" class="empty__tools">
        <button
          v-for="tool in tools"
          :key="tool.id"
          class="tool-card"
          type="button"
          @click="openTool(tool)"
        >
          <i class="tool-card__icon" :class="tool.icon" aria-hidden="true" />
          <span class="tool-card__text">
            <strong class="tool-card__title">{{ tool.title }}</strong>
            <small v-if="tool.description" class="tool-card__note">{{ tool.description }}</small>
          </span>
        </button>
      </div>

      <p v-else class="empty__note">Инструменты ещё не зарегистрированы.</p>
    </section>

    <footer class="empty__status">
      <span class="status__dot" :class="{ 'status__dot--off': !startup }" aria-hidden="true" />
      <span>{{ startup ? "Ядро запущено" : "Нет связи с ядром" }}</span>
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
  max-width: 960px;
  margin: 0 auto;
  padding: var(--ag-space-2xl);
  overflow: auto;
}

.empty__head {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-sm);
}

.empty__title {
  margin: 0;
  font-size: var(--ag-text-xl);
  line-height: 1.25;
}

.empty__lead {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-md);
  line-height: 1.55;
}

.empty__section {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-lg);
}

.empty__section-title {
  margin: 0;
  font-size: var(--ag-text-lg);
  font-weight: 600;
}

.empty__templates {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--ag-space-lg);
}

.template-card {
  display: flex;
  flex-direction: column;
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

.template-card:hover {
  border-color: var(--ag-border-strong);
}

.template-card:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

/* Миниатюра раскладки: колонки и ячейки в тех же пропорциях, что на вкладке. */
.template-card__preview {
  display: flex;
  gap: var(--ag-space-xs);
  height: 48px;
  padding: var(--ag-space-sm);
  border-radius: var(--ag-radius-sm);
  background: var(--ag-surface-2);
}

.template-card__column {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  gap: var(--ag-space-xs);
  min-width: 0;
}

.template-card__cell {
  flex: 1 1 0;
  min-height: 4px;
  border-radius: 2px;
  background: var(--p-surface-300);
}

.template-card__text {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-xs);
  min-width: 0;
  padding: 0 var(--ag-space-sm) var(--ag-space-sm);
}

.template-card__title {
  overflow: hidden;
  font-size: var(--ag-text-sm);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-card__note {
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.empty__tools {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--ag-space-lg);
}

.tool-card {
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

.tool-card:hover {
  border-color: var(--ag-border-strong);
}

.tool-card:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.tool-card__icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--p-primary-color);
  font-size: 18px;
}

.tool-card__text {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-xs);
  min-width: 0;
}

.tool-card__title {
  font-size: var(--ag-text-md);
  font-weight: 600;
}

.tool-card__note {
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
  line-height: 1.45;
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

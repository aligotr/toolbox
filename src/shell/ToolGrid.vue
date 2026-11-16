<script setup lang="ts">
// Сетка вкладки: колонки и инструменты в них.
//
// Внутренняя модель — дерево, но показываются только колонки (ADR 0011).
// Оболочка не знает, что делает инструмент: она находит дескриптор по `id`
// и отдаёт ему ячейку. Инструмент, которого нет в реестре (например, после
// переноса папки без модуля), превращается в подписанную пустую ячейку,
// а не в ошибку загрузки.

import { computed } from "vue";
import type { ToolDescriptor } from "../contracts/tools";
import type { TabColumn } from "../contracts/workspace";
import { cellKey } from "../core/services/workspace/index";

const props = defineProps<{ tabId: string; columns: TabColumn[]; tools: ToolDescriptor[] }>();

/** Поиск компонента по идентификатору: один раз на изменение реестра. */
const toolsById = computed(() => new Map(props.tools.map((tool) => [tool.id, tool])));

function findTool(id: string): ToolDescriptor | undefined {
  return toolsById.value.get(id);
}
</script>

<template>
  <div class="grid">
    <section
      v-for="(column, columnIndex) in columns"
      :key="columnIndex"
      class="grid__column"
      :style="{ flexGrow: column.width }"
    >
      <div
        v-for="(toolId, toolIndex) in column.tools"
        :key="cellKey(props.tabId, columnIndex, toolIndex)"
        class="grid__cell"
      >
        <component
          :is="findTool(toolId)?.component"
          v-if="findTool(toolId)"
          :cell-key="cellKey(props.tabId, columnIndex, toolIndex)"
        />
        <div v-else class="grid__unknown">
          <i class="pi pi-question-circle" aria-hidden="true" />
          <span>Инструмент не найден: <code>{{ toolId }}</code></span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.grid {
  display: flex;
  height: 100%;
  min-height: 0;
}

.grid__column {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.grid__column + .grid__column {
  border-left: 1px solid var(--ag-border);
}

.grid__cell {
  flex: 1 1 0;
  min-height: 0;
  padding: var(--ag-space-lg);
  overflow: auto;
}

.grid__cell + .grid__cell {
  border-top: 1px solid var(--ag-border);
}

.grid__unknown {
  display: flex;
  align-items: center;
  gap: var(--ag-space-sm);
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-sm);
}

.grid__unknown code {
  font-family: var(--ag-font-mono);
  font-size: var(--ag-text-xs);
}
</style>

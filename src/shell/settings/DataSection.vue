<script setup lang="ts">
// Раздел «Данные»: сколько занимают лог, шаблоны и данные инструментов.
//
// Удаляются только данные конкретного инструмента и только в корзину
// (`local/trash/data/`). Логи чистит раздел «Журнал»: у них своё правило
// хранения по возрасту, и смешивать две причины удаления в одном списке
// значило бы прятать разницу.

import Button from "primevue/button";
import { useConfirm } from "primevue/useconfirm";
import { computed, onMounted } from "vue";
import type { ToolStats } from "../../contracts/data";
import type { ToolDescriptor } from "../../contracts/tools";
import { CONFIRM_CALM_REJECT, CONFIRM_DANGER_ACCEPT } from "../../core/constants";
import { clearToolData, loadStorageStats, status, storageStats } from "../../core/services/data";
import { loadProfiles } from "../../core/services/profiles";
import { filesLabel } from "../plural";
import { formatBytes } from "./format";

const props = defineProps<{ tools: ToolDescriptor[] }>();

const confirm = useConfirm();

/** Названия инструментов: папка называется идентификатором, человек — нет. */
const titles = computed(
  () => new Map(props.tools.map((tool) => [tool.id, tool.title])),
);

const logs = computed(() => storageStats.current?.logs ?? null);
const templates = computed(() => storageStats.current?.templates ?? null);
const toolData = computed(() => storageStats.current?.tools ?? []);

/** Подпись инструмента; удалённый инструмент показывается своим id. */
function titleOf(id: string): string {
  return titles.value.get(id) ?? id;
}

function requestClear(tool: ToolStats): void {
  confirm.require({
    header: "Удаление данных",
    message:
      `Данные инструмента «${titleOf(tool.id)}» будут перемещены в ` +
      "local/trash/data. Папку можно вернуть, пока корзину не почистили.",
    acceptLabel: "Удалить",
    rejectLabel: "Отмена",
    acceptProps: CONFIRM_DANGER_ACCEPT,
    rejectProps: CONFIRM_CALM_REJECT,
    accept: async () => {
      if (await clearToolData(tool.id)) {
        // Счётчики профилей показывает соседний раздел: обновляем и его,
        // иначе после удаления там остались бы старые числа.
        void loadProfiles();
      }
    },
  });
}

onMounted(() => {
  void loadStorageStats();
});
</script>

<template>
  <section class="data">
    <header class="data__head">
      <h2 class="data__title">Данные</h2>
      <p class="data__lead">
        Логи, шаблоны и данные инструментов активного профиля. Удаление данных
        инструмента переносит папку в корзину: файлы можно вернуть, пока её
        не почистили.
      </p>
    </header>

    <p v-if="status.load.error" class="data__error">{{ status.load.error }}</p>
    <p v-if="!storageStats.loaded" class="data__note">Размеры читаются…</p>

    <template v-else>
      <dl class="data__summary">
        <div class="data__summary-row">
          <dt>Логи</dt>
          <dd v-if="logs">
            {{ filesLabel(logs.files) }} · {{ formatBytes(logs.bytes) }}
          </dd>
        </div>
        <div class="data__summary-row">
          <dt>Шаблоны</dt>
          <dd v-if="templates">
            {{ filesLabel(templates.files) }} · {{ formatBytes(templates.bytes) }}
          </dd>
        </div>
      </dl>

      <div class="data__tools">
        <h3 class="data__subtitle">Данные инструментов</h3>

        <p v-if="!toolData.length" class="data__note">
          Данных нет: пока ни один инструмент не сохранил файлы в профиль.
        </p>

        <ul v-else class="data__list">
          <li v-for="tool in toolData" :key="tool.id" class="data-row">
            <div class="data-row__main">
              <strong class="data-row__name">{{ titleOf(tool.id) }}</strong>
              <span class="data-row__meta">
                {{ filesLabel(tool.files) }} · {{ formatBytes(tool.bytes) }}
                <span class="data-row__id mono">{{ tool.id }}</span>
              </span>
            </div>

            <Button
              label="Удалить данные"
              size="small"
              severity="danger"
              text
              :loading="status.clear.loading"
              @click="requestClear(tool)"
            />
          </li>
        </ul>
      </div>
    </template>

    <p v-if="status.clear.error" class="data__error">{{ status.clear.error }}</p>
  </section>
</template>

<style scoped>
.data {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-lg);
}

.data__head {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-sm);
}

.data__title {
  margin: 0;
  font-size: var(--ag-text-lg);
  font-weight: 600;
}

.data__lead {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-sm);
  line-height: 1.5;
}

.data__summary {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-sm);
  margin: 0;
}

.data__summary-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ag-space-lg);
  padding: var(--ag-space-lg);
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-md);
  background: var(--ag-surface);
}

.data__summary-row dt {
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-sm);
}

.data__summary-row dd {
  margin: 0;
  font-size: var(--ag-text-sm);
}

.data__tools {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-sm);
}

.data__subtitle {
  margin: 0;
  font-size: var(--ag-text-md);
  font-weight: 600;
}

.data__list {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}

.data-row {
  display: flex;
  align-items: center;
  gap: var(--ag-space-lg);
  flex-wrap: wrap;
  padding: var(--ag-space-lg);
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-md);
  background: var(--ag-surface);
}

.data-row__main {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-xs);
  min-width: 200px;
  margin-right: auto;
}

.data-row__name {
  font-size: var(--ag-text-md);
}

.data-row__meta {
  display: flex;
  align-items: center;
  gap: var(--ag-space-sm);
  flex-wrap: wrap;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.data-row__id {
  overflow: hidden;
  max-width: 240px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.data__note,
.data__error {
  margin: 0;
  font-size: var(--ag-text-sm);
}

.data__note {
  color: var(--p-text-muted-color);
}

.data__error {
  color: var(--ag-danger);
  font-size: var(--ag-text-xs);
  line-height: 1.45;
}

.mono {
  font-family: var(--ag-font-mono);
  font-size: var(--ag-text-xs);
}
</style>

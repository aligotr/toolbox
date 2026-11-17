<script setup lang="ts">
// Раскрытие строки таблицы DNS.
//
// Показывает все выбранные серверы, включая скрытые колонки: пользователь
// раскрыл строку, чтобы увидеть ответы целиком, и прятать часть из них
// было бы обманом. Записи приходят готовыми — компонент только читает
// ячейку и раскладывает статус, адрес и TTL.
//
// Правила чтения ячейки живут в `cell.ts`: те же подписи нужны таблице.

import { t } from "@/core/infra/i18n";
import { answersOf, elapsedOf, noteFor, statusClass, statusLabel, statusShown } from "../cell";
import type { CellDetailsEntry, ServerOption } from "../types";

defineProps<{
  /** Серверы раскрытия и их результаты; порядок — порядок колонок. */
  entries: CellDetailsEntry[];
}>();

/** Подпись сервера: адрес или пометка «системный». */
function serverAddress(server: ServerOption): string {
  return server.address ?? t("dnslookup.cell.osAddresses");
}
</script>

<template>
  <div class="details">
    <div class="details__grid">
      <article v-for="entry in entries" :key="entry.server.id" class="details__card">
        <header class="details__head">
          <strong class="details__name">{{ entry.server.label }}</strong>
          <span class="details__address">{{ serverAddress(entry.server) }}</span>
          <span
            v-if="statusShown(entry.cell)"
            class="details__status"
            :class="statusClass(entry.cell)"
          >
            {{ statusLabel(entry.cell) }}
          </span>
          <span v-if="elapsedOf(entry.cell) !== null" class="details__time">
            {{ t("dnslookup.cell.elapsed", { value: elapsedOf(entry.cell) ?? 0 }) }}
          </span>
        </header>

        <ul v-if="answersOf(entry.cell).length > 0" class="details__answers">
          <li v-for="(answer, index) in answersOf(entry.cell)" :key="index" class="details__answer">
            <code>{{ answer.value }}</code>
            <span v-if="answer.ttl !== null" class="details__ttl">
              {{ t("dnslookup.cell.ttl", { value: answer.ttl ?? 0 }) }}
            </span>
          </li>
        </ul>
        <p v-else class="details__note">{{ noteFor(entry.cell) }}</p>
      </article>
    </div>
  </div>
</template>

<style scoped>
.details {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-md);
  padding: var(--ag-space-sm) var(--ag-space-lg) var(--ag-space-lg);
}

.details__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--ag-space-md);
}

.details__card {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-sm);
  min-width: 0;
  padding: var(--ag-space-sm) var(--ag-space-md);
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-md);
  background: var(--ag-surface-2);
}

.details__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--ag-space-xs) var(--ag-space-sm);
}

.details__name {
  font-size: var(--ag-text-sm);
}

.details__address {
  color: var(--p-text-muted-color);
  font-family: var(--ag-font-mono);
  font-size: var(--ag-text-xs);
}

.details__status {
  font-size: var(--ag-text-xs);
  font-weight: 600;
}

.details__time {
  margin-left: auto;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
  font-variant-numeric: tabular-nums;
}

.details__answers {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-xs);
  margin: 0;
  padding: 0;
  list-style: none;
}

.details__answer {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ag-space-sm);
  min-width: 0;
}

.details__answer code {
  min-width: 0;
  overflow-wrap: anywhere;
  font-family: var(--ag-font-mono);
  font-size: var(--ag-text-xs);
}

.details__ttl {
  flex-shrink: 0;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.details__note {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}
</style>

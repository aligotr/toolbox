<script setup lang="ts">
// Таблица DNS: строки — домены, колонки — серверы.
//
// Компонент отвечает только за показ и раскрытие. Данные приходят готовыми:
// отфильтрованные строки, выбранные серверы и карта результатов. Поэтому
// таблица не решает, когда запускать проверку, — это дело `useDnslookup`.
//
// «Домен» и «Тип» закреплены слева: при большом числе серверов без этого
// теряется соответствие строки домену. Порядок строк — порядок добавления,
// сортировки нет: сравнение идёт построчно.

import Button from "primevue/button";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import Select from "primevue/select";
import { nextTick, ref, watch } from "vue";
import {
  DOMAIN_COLUMN_MIN_WIDTH,
  RECORD_TYPES,
  SERVER_COLUMN_MIN_WIDTH,
  STATUS_LABELS,
  TYPE_COLUMN_MIN_WIDTH,
} from "./constants";
import type {
  DnsAnswer,
  DnsCell,
  DnsRow,
  RecordType,
  RowVerdict,
  ServerOption,
} from "./types";

const props = defineProps<{
  rows: DnsRow[];
  totalRows: number;
  /** Видимые серверные колонки: скрытые не рисуются, но данные целы. */
  servers: ServerOption[];
  /** Все выбранные серверы: в раскрытии показываются и скрытые колонки. */
  expansionServers: ServerOption[];
  cells: Map<string, DnsCell>;
  verdicts: Map<string, RowVerdict>;
  highlightRowId: string | null;
  /** Идёт проверка: смена типа и повтор строки недоступны. */
  busy: boolean;
}>();

const emit = defineEmits<{
  "type-changed": [rowId: string, type: RecordType];
  repeat: [rowId: string];
  delete: [rowId: string];
}>();

const expandedKeys = ref<string[]>([]);
const root = ref<HTMLElement | null>(null);

/** Результат ячейки по паре «строка × сервер». */
function cellOf(rowId: string, serverId: string): DnsCell | undefined {
  return props.cells.get(`${rowId}:${serverId}`);
}

/** Статус можно показать и без результата: тогда это «ожидание». */
function statusLabel(cell: DnsCell | undefined): string {
  return STATUS_LABELS[cell?.status ?? "pending"];
}

/** Пока идёт повторная проверка, показываем прошлые записи приглушённо. */
function answersOf(cell: DnsCell | undefined): DnsAnswer[] {
  if (!cell) return [];
  return cell.status === "pending" ? (cell.previous?.answers ?? []) : cell.answers;
}

/** Время ответа из текущего или прошлого результата. */
function elapsedOf(cell: DnsCell | undefined): number | null {
  if (!cell) return null;
  return cell.status === "pending"
    ? (cell.previous?.elapsedMs ?? null)
    : cell.elapsedMs;
}

/** Первая запись и число остальных: в ячейке не место длинному списку. */
function answerText(cell: DnsCell | undefined): string {
  const answers = answersOf(cell);
  if (answers.length === 0) return "";
  const first = answers[0].value;
  return answers.length > 1 ? `${first} +${answers.length - 1}` : first;
}

/** Оформление статуса: цвет только дополняет подпись, не заменяет её. */
function statusClass(cell: DnsCell | undefined): string {
  return `cell__status--${cell?.status ?? "pending"}`;
}

/** Текст вердикта; `null` — системного сервера нет, сравнивать не с чем. */
function verdictText(verdict: RowVerdict | undefined): string {
  if (!verdict) return "";
  if (verdict.differs) {
    return `расходится у ${verdict.total - verdict.matched} из ${verdict.total}`;
  }
  return `совпадает у ${verdict.matched} из ${verdict.total}`;
}

/** Подпись сервера в раскрытии: адрес или пометка «системный». */
function serverAddress(server: ServerOption): string {
  return server.address ?? "адреса ОС";
}

/** Пояснение для пустой ячейки: причина важнее прочерка. */
function noteFor(cell: DnsCell | undefined): string {
  if (!cell) return "нет данных";
  if (cell.status === "pending") return "ожидание ответа";
  if (cell.status === "cancelled") return "проверка остановлена";
  if (cell.error) return cell.error;
  return "записей нет";
}

/** Классы строки: расхождение и недавний дубликат. */
function rowClass(row: DnsRow): string {
  const classes: string[] = [];
  if (props.verdicts.get(row.id)?.differs) classes.push("dns-row--diff");
  if (props.highlightRowId === row.id) classes.push("dns-row--highlight");
  return classes.join(" ");
}

/** Клик по ячейке раскрывает строку, как и шеврон. */
function toggle(rowId: string): void {
  const index = expandedKeys.value.indexOf(rowId);
  if (index >= 0) {
    expandedKeys.value.splice(index, 1);
  } else {
    expandedKeys.value.push(rowId);
  }
}

/** Тип меняется у строки, а не у копии пропса: значение приходит событием. */
function onTypeChange(rowId: string, event: { value: unknown }): void {
  emit("type-changed", rowId, event.value as RecordType);
}

// Дубликат подсвечивается, но может быть за пределами видимой области.
// Прокрутка идёт к маркеру внутри ячейки домена: сама строка не имеет id.
watch(
  () => props.highlightRowId,
  (rowId) => {
    if (!rowId) return;
    void nextTick(() => {
      const marker = root.value?.querySelector<HTMLElement>(
        `[data-row-id="${rowId}"]`,
      );
      marker?.closest("tr")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  },
  // Синхронно: повторная подсветка строки приходит как сброс и новое
  // значение в одном такте, и обычный watcher увидел бы только итог.
  { flush: "sync" },
);
</script>

<template>
  <div ref="root" class="dns-table">
    <DataTable
      v-model:expanded-row-keys="expandedKeys"
      :value="rows"
      data-key="id"
      :row-class="rowClass"
      scrollable
      size="small"
    >
      <template #empty>
        <div class="dns-table__empty">
          <i class="pi pi-search" aria-hidden="true" />
          <p v-if="totalRows === 0">Добавьте домен или вставьте список</p>
          <p v-else>Нет строк по текущим условиям</p>
        </div>
      </template>

      <Column
        field="name"
        header="Домен"
        frozen
        align-frozen="left"
        :style="{ minWidth: DOMAIN_COLUMN_MIN_WIDTH }"
      >
        <template #body="{ data }">
          <div class="dns-table__domain">
            <div class="dns-table__domain-main">
              <span class="dns-table__name" :data-row-id="data.id">{{ data.input }}</span>
              <Button
                icon="pi pi-refresh"
                size="small"
                text
                rounded
                severity="secondary"
                aria-label="Повторить строку"
                :disabled="busy"
                @click.stop="emit('repeat', data.id)"
              />
            </div>
            <small v-if="data.name !== data.input" class="dns-table__normalized">
              {{ data.name }}
            </small>
            <small
              v-if="verdicts.get(data.id)"
              class="dns-table__verdict"
              :class="{ 'dns-table__verdict--diff': verdicts.get(data.id)?.differs }"
            >
              {{ verdictText(verdicts.get(data.id)) }}
            </small>
          </div>
        </template>
      </Column>

      <Column
        field="type"
        header="Тип"
        frozen
        align-frozen="left"
        :style="{ minWidth: TYPE_COLUMN_MIN_WIDTH }"
      >
        <template #body="{ data }">
          <Select
            :model-value="data.type"
            :options="RECORD_TYPES"
            size="small"
            class="dns-table__type"
            :disabled="busy"
            :aria-label="`Тип записи для ${data.input}`"
            @change="onTypeChange(data.id, $event)"
          />
        </template>
      </Column>

      <Column
        v-for="server in servers"
        :key="server.id"
        :style="{ minWidth: SERVER_COLUMN_MIN_WIDTH }"
      >
        <template #header>
          <div class="dns-table__server">
            <span class="dns-table__server-name">{{ server.label }}</span>
            <small class="dns-table__server-address">{{ serverAddress(server) }}</small>
          </div>
        </template>

        <template #body="{ data }">
          <button
            type="button"
            class="cell"
            :aria-expanded="expandedKeys.includes(data.id)"
            :aria-label="`${server.label}: ${statusLabel(cellOf(data.id, server.id))}, подробности`"
            @click="toggle(data.id)"
          >
            <span class="cell__status" :class="statusClass(cellOf(data.id, server.id))">
              {{ statusLabel(cellOf(data.id, server.id)) }}
            </span>
            <span
              v-if="answerText(cellOf(data.id, server.id))"
              class="cell__value"
              :class="{ 'cell__value--stale': cellOf(data.id, server.id)?.status === 'pending' }"
            >
              {{ answerText(cellOf(data.id, server.id)) }}
            </span>
            <span
              v-if="elapsedOf(cellOf(data.id, server.id)) !== null"
              class="cell__time"
            >
              {{ elapsedOf(cellOf(data.id, server.id)) }} мс
            </span>
          </button>
        </template>
      </Column>

      <template #expansion="{ data }">
        <div class="details">
          <div
            v-for="server in expansionServers"
            :key="server.id"
            class="details__row"
          >
            <div class="details__head">
              <strong class="details__name">{{ server.label }}</strong>
              <span class="details__meta">{{ serverAddress(server) }}</span>
              <span
                v-if="elapsedOf(cellOf(data.id, server.id)) !== null"
                class="details__meta"
              >
                · {{ elapsedOf(cellOf(data.id, server.id)) }} мс
              </span>
              <span
                class="details__status"
                :class="statusClass(cellOf(data.id, server.id))"
              >
                {{ statusLabel(cellOf(data.id, server.id)) }}
              </span>
            </div>

            <ul
              v-if="answersOf(cellOf(data.id, server.id)).length > 0"
              class="details__answers"
            >
              <li
                v-for="(answer, index) in answersOf(cellOf(data.id, server.id))"
                :key="index"
                class="details__answer"
              >
                <code>{{ answer.value }}</code>
                <span v-if="answer.ttl !== null" class="details__ttl">
                  TTL {{ answer.ttl }}
                </span>
              </li>
            </ul>
            <p v-else class="details__note">
              {{ noteFor(cellOf(data.id, server.id)) }}
            </p>
          </div>

          <div class="details__actions">
            <Button
              label="Повторить строку"
              icon="pi pi-refresh"
              size="small"
              text
              :disabled="busy"
              @click="emit('repeat', data.id)"
            />
            <Button
              label="Удалить строку"
              icon="pi pi-trash"
              size="small"
              text
              severity="danger"
              :disabled="busy"
              @click="emit('delete', data.id)"
            />
          </div>
        </div>
      </template>
    </DataTable>
  </div>
</template>

<style scoped>
.dns-table {
  min-width: 0;
  border: 1px solid var(--p-surface-700);
  border-radius: 8px;
  overflow: hidden;
}

.dns-table__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 16px;
  color: var(--p-text-muted-color);
  font-size: 14px;
}

.dns-table__empty i {
  font-size: 24px;
}

.dns-table__empty p {
  margin: 0;
}

.dns-table__domain {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.dns-table__domain-main {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.dns-table__name {
  flex: 1;
  overflow: hidden;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dns-table__normalized {
  overflow: hidden;
  color: var(--p-text-muted-color);
  font-family: var(--ag-font-mono);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dns-table__verdict {
  font-size: 12px;
  color: var(--p-text-muted-color);
}

.dns-table__verdict--diff {
  color: var(--p-orange-400);
}

.dns-table__type {
  width: 88px;
}

.dns-table__server {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dns-table__server-name {
  font-size: 14px;
  font-weight: 600;
}

.dns-table__server-address {
  color: var(--p-text-muted-color);
  font-family: var(--ag-font-mono);
  font-size: 12px;
  font-weight: 400;
}

.cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.cell:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.cell__status {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.4px;
  text-transform: uppercase;
}

.cell__status--ok {
  color: var(--p-green-400);
}

.cell__status--nodata,
.cell__status--nxdomain,
.cell__status--cancelled {
  color: var(--p-text-muted-color);
}

.cell__status--pending {
  color: var(--p-primary-color);
}

.cell__status--timeout {
  color: var(--p-orange-400);
}

.cell__status--servfail,
.cell__status--refused,
.cell__status--formerr,
.cell__status--notimp,
.cell__status--offline,
.cell__status--bad_response {
  color: var(--p-red-400);
}

.cell__value {
  overflow: hidden;
  max-width: 100%;
  font-family: var(--ag-font-mono);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell__value--stale {
  opacity: 0.45;
}

.cell__time {
  color: var(--p-text-muted-color);
  font-size: 11px;
}

.details {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 16px 16px;
}

.details__row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.details__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
}

.details__name {
  font-size: 14px;
}

.details__meta {
  color: var(--p-text-muted-color);
  font-family: var(--ag-font-mono);
  font-size: 12px;
}

.details__status {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.4px;
  text-transform: uppercase;
}

.details__answers {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.details__answer {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.details__answer code {
  overflow-wrap: anywhere;
  font-family: var(--ag-font-mono);
  font-size: 13px;
}

.details__ttl {
  flex-shrink: 0;
  color: var(--p-text-muted-color);
  font-size: 12px;
}

.details__note {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 13px;
}

.details__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.dns-table :deep(.dns-row--diff > td) {
  background: color-mix(in srgb, var(--p-surface-950) 70%, var(--p-orange-400) 30%);
}

.dns-table :deep(.dns-row--diff > td:first-child) {
  box-shadow: inset 3px 0 0 var(--p-orange-400);
}

.dns-table :deep(.dns-row--highlight > td) {
  animation: dns-row-flash 1.6s ease-out;
}

@keyframes dns-row-flash {
  from {
    background: color-mix(in srgb, var(--p-surface-800) 40%, var(--p-primary-color) 60%);
  }
  to {
    background: transparent;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dns-table :deep(.dns-row--highlight > td) {
    animation: none;
  }
}
</style>

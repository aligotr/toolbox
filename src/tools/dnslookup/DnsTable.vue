<script setup lang="ts">
// Таблица DNS: строки — домены, колонки — серверы.
//
// Компонент отвечает только за показ и раскрытие. Данные приходят готовыми:
// отфильтрованные строки, выбранные серверы и карта результатов. Поэтому
// таблица не решает, когда запускать проверку, — это дело `useDnslookup`.
//
// «Домен» и «Тип» закреплены слева: при большом числе серверов без этого
// теряется соответствие строки домену. Порядок строк — порядок добавления;
// при включённом `reorderable` строку можно перенести перетаскиванием.
// Сортировки нет: сравнение идёт построчно.

import Button from "primevue/button";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import { nextTick, ref, watch } from "vue";
import PlainSelect from "../../ui/PlainSelect.vue";
import { useRowDrag } from "../../ui/useRowDrag";
import {
  DOMAIN_COLUMN_MIN_WIDTH,
  RECORD_TYPES,
  SERVER_COLUMN_MIN_WIDTH,
  STATUS_LABELS,
  SYSTEM_SERVER_ID,
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
  /** Подсказка к заголовку системного сервера: его адреса приходят от ОС. */
  systemHint: string;
  /** Идёт проверка: смена типа и повтор строки недоступны. */
  busy: boolean;
  /** Перестановка строк перетаскиванием: выключена, пока не включена явно. */
  reorderable?: boolean;
}>();

const emit = defineEmits<{
  "type-changed": [rowId: string, type: RecordType];
  repeat: [rowId: string];
  delete: [rowId: string];
  /** Новый порядок строк: индексы приходят после переноса. */
  reorder: [from: number, to: number];
}>();

/** Раскрытые строки: объект по ключу строки — так их ждёт DataTable. */
const expandedRows = ref<Record<string, boolean>>({});
const root = ref<HTMLElement | null>(null);

// Перенос строк подключается одним вызовом: при выключенном флаге помощник
// не трогает таблицу, а для удаления функции достаточно этой строки.
useRowDrag(root, {
  enabled: () => props.reorderable === true,
  grab: ".dns-table__domain",
  count: () => props.rows.length,
  reorder: (from, to) => emit("reorder", from, to),
});

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

/** Первая запись: остальные показываются в подробностях строки. */
function firstAnswer(cell: DnsCell | undefined): string {
  return answersOf(cell)[0]?.value ?? "";
}

/** Сколько записей скрыто за первой: пометка «+2» приглашает раскрыть строку. */
function extraAnswers(cell: DnsCell | undefined): number {
  return Math.max(answersOf(cell).length - 1, 0);
}

/** Статус — только когда он что-то сообщает: «OK» рядом с адресом лишний,
    ошибка или пустой ответ — наоборот, главное. */
function statusShown(cell: DnsCell | undefined): boolean {
  if (!cell) return true;
  if (cell.status === "ok" || cell.status === "pending" || cell.status === "cancelled") {
    return answersOf(cell).length === 0;
  }
  return true;
}

/** Подпись ячейки для чтения с экрана: сначала результат, потом статус. */
function cellLabel(server: ServerOption, cell: DnsCell | undefined): string {
  const value = firstAnswer(cell);
  const extra = extraAnswers(cell);
  const status = statusLabel(cell);
  const text = value
    ? `${value}${extra > 0 ? ` и ещё ${extra}` : ""} (${status})`
    : status;
  return `${server.label}: ${text}, подробности`;
}

/** Оформление статуса: цвет только дополняет подпись, не заменяет её. */
function statusClass(cell: DnsCell | undefined): string {
  return `cell__status--${cell?.status ?? "pending"}`;
}

/** Данные раскрытия: сервер и его результат, включая скрытые колонки. */
function detailsOf(
  rowId: string,
): { server: ServerOption; cell: DnsCell | undefined }[] {
  return props.expansionServers.map((server) => ({
    server,
    cell: cellOf(rowId, server.id),
  }));
}

/** Строка раскрыта: шеврон развёрнут. */
function isExpanded(rowId: string): boolean {
  return expandedRows.value[rowId] === true;
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
  if (isExpanded(rowId)) {
    delete expandedRows.value[rowId];
  } else {
    expandedRows.value[rowId] = true;
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
  <div ref="root" class="dns-table" :class="{ 'dns-table--empty': rows.length === 0 }">
    <DataTable
      v-model:expanded-rows="expandedRows"
      :value="rows"
      data-key="id"
      :row-class="rowClass"
      scrollable
      size="small"
    >
      <template #empty>
        <div class="dns-table__empty">
          <i class="pi pi-search" aria-hidden="true" />
          <p v-if="totalRows === 0">Добавьте домен</p>
          <p v-else>Нет строк по текущим условиям</p>
        </div>
      </template>

      <Column
        field="name"
        frozen
        align-frozen="left"
        :style="{ minWidth: DOMAIN_COLUMN_MIN_WIDTH }"
      >
        <template #header>
          <span class="dns-table__domains">
            <span>Домены</span>
            <sup v-if="totalRows > 0" class="dns-table__count">{{ totalRows }}</sup>
          </span>
        </template>
        <template #body="{ data }">
          <div class="dns-table__domain">
            <div class="dns-table__domain-main">
              <Button
                icon="pi pi-chevron-right"
                size="small"
                text
                rounded
                severity="secondary"
                class="dns-table__expand"
                :class="{ 'dns-table__expand--open': isExpanded(data.id) }"
                :aria-expanded="isExpanded(data.id)"
                :aria-label="isExpanded(data.id) ? 'Свернуть подробности' : 'Подробности'"
                @click="toggle(data.id)"
              />
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
              <Button
                icon="pi pi-trash"
                size="small"
                text
                rounded
                severity="secondary"
                class="dns-table__delete"
                aria-label="Удалить строку"
                :disabled="busy"
                @click.stop="emit('delete', data.id)"
              />
            </div>
            <small v-if="data.name !== data.input" class="dns-table__normalized">
              {{ data.name }}
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
          <PlainSelect
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
            <i
              v-if="server.id === SYSTEM_SERVER_ID && systemHint"
              v-tooltip.top="systemHint"
              class="pi pi-info-circle dns-table__system-hint"
              :aria-label="systemHint"
              tabindex="0"
            />
          </div>
        </template>

        <template #body="{ data }">
          <button
            type="button"
            class="cell"
            :aria-expanded="isExpanded(data.id)"
            :aria-label="cellLabel(server, cellOf(data.id, server.id))"
            @click="toggle(data.id)"
          >
            <span
              v-if="statusShown(cellOf(data.id, server.id))"
              class="cell__status"
              :class="statusClass(cellOf(data.id, server.id))"
            >
              {{ statusLabel(cellOf(data.id, server.id)) }}
            </span>
            <span v-if="firstAnswer(cellOf(data.id, server.id))" class="cell__line">
              <span
                class="cell__value"
                :class="{ 'cell__value--stale': cellOf(data.id, server.id)?.status === 'pending' }"
              >
                {{ firstAnswer(cellOf(data.id, server.id)) }}
              </span>
              <span v-if="extraAnswers(cellOf(data.id, server.id)) > 0" class="cell__more">
                +{{ extraAnswers(cellOf(data.id, server.id)) }}
              </span>
            </span>
          </button>
        </template>
      </Column>

      <template #expansion="{ data }">
        <div class="details">
          <div class="details__grid">
            <article
              v-for="entry in detailsOf(data.id)"
              :key="entry.server.id"
              class="details__card"
            >
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
                  {{ elapsedOf(entry.cell) }} мс
                </span>
              </header>

              <ul v-if="answersOf(entry.cell).length > 0" class="details__answers">
                <li
                  v-for="(answer, index) in answersOf(entry.cell)"
                  :key="index"
                  class="details__answer"
                >
                  <code>{{ answer.value }}</code>
                  <span v-if="answer.ttl !== null" class="details__ttl">
                    TTL {{ answer.ttl }}
                  </span>
                </li>
              </ul>
              <p v-else class="details__note">{{ noteFor(entry.cell) }}</p>
            </article>
          </div>
        </div>
      </template>
    </DataTable>
  </div>
</template>

<style scoped>
/* Таблица растягивается на высоту, отданную панелью: шапка на месте,
   прокручивается только тело. */
.dns-table {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-md);
  overflow: hidden;
}

/* Пустой таблице нужна высота, чтобы сообщение не липло к шапке. */
.dns-table--empty {
  min-height: 200px;
}

.dns-table :deep(.p-datatable) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}

.dns-table :deep(.p-datatable-table-container) {
  flex: 1 1 auto;
  min-height: 0;
}

/* Пустое состояние занимает всю таблицу: сообщение стоит по центру.
   Строки с данными высоту не тянут — плотность не зависит от их числа. */
.dns-table--empty :deep(.p-datatable-table) {
  height: 100%;
}

.dns-table :deep(.p-datatable-empty-message > td) {
  padding: 0;
}

.dns-table__empty {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: var(--ag-space-sm);
  height: 100%;
  padding: var(--ag-space-2xl) var(--ag-space-lg);
  box-sizing: border-box;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-sm);
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
  gap: var(--ag-space-xs);
  min-width: 0;
}

.dns-table__domain-main {
  display: flex;
  align-items: center;
  gap: var(--ag-space-xs);
  min-width: 0;
}

.dns-table__name {
  flex: 1;
  overflow: hidden;
  font-size: var(--ag-text-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Шеврон раскрытия: поворачивается, когда подробности открыты. */
.dns-table__expand {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  margin-left: -4px;
}

.dns-table__expand :deep(.p-button-icon) {
  font-size: 13px;
  transition: transform 120ms ease;
}

.dns-table__expand--open :deep(.p-button-icon) {
  transform: rotate(90deg);
}

.dns-table__normalized {
  overflow: hidden;
  padding-left: var(--ag-space-xl);
  color: var(--p-text-muted-color);
  font-family: var(--ag-font-mono);
  font-size: var(--ag-text-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Удаление живёт в строке: серая иконка, опасный цвет — при наведении. */
.dns-table__delete {
  flex-shrink: 0;
  color: var(--p-text-muted-color);
}

.dns-table__delete:not(:disabled):hover {
  color: var(--ag-danger);
}

/* Счётчик доменов — знак степени у заголовка: он подсказывает объём,
   но не спорит с заголовком по весу. */
.dns-table__domains {
  white-space: nowrap;
}

.dns-table__count {
  color: var(--p-text-muted-color);
  font-size: 0.75em;
  font-weight: 600;
  line-height: 0;
}

.dns-table__type {
  width: 76px;
}

/* Шапка колонки — только имя резолвера: адрес живёт в подробностях. */
.dns-table__server {
  display: flex;
  align-items: center;
  gap: var(--ag-space-sm);
  min-width: 0;
  white-space: nowrap;
}

.dns-table__server-name {
  font-size: var(--ag-text-sm);
  font-weight: 600;
}

/* Адреса системных резолверов приходят от ОС: подсказка у имени колонки,
   а не отдельная строка над таблицей. */
.dns-table__system-hint {
  color: var(--p-text-muted-color);
  font-size: 13px;
  cursor: help;
}

.dns-table__system-hint:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ag-space-xs);
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
  font-size: var(--ag-text-xs);
  font-weight: 600;
}

.cell__status--ok {
  color: var(--ag-ok);
}

.cell__status--nodata,
.cell__status--nxdomain,
.cell__status--cancelled,
.cell__status--pending {
  color: var(--p-text-muted-color);
}

.cell__status--timeout {
  color: var(--ag-warn);
}

.cell__status--servfail,
.cell__status--refused,
.cell__status--formerr,
.cell__status--notimp,
.cell__status--offline,
.cell__status--bad_response {
  color: var(--ag-danger);
}

.cell__line {
  display: flex;
  align-items: baseline;
  gap: var(--ag-space-xs);
  max-width: 100%;
  min-width: 0;
}

.cell__value {
  overflow: hidden;
  min-width: 0;
  font-family: var(--ag-font-mono);
  font-size: var(--ag-text-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell__value--stale {
  opacity: 0.45;
}

/* Пометка «+2»: сколько записей ждёт в подробностях строки. */
.cell__more {
  flex-shrink: 0;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
  font-variant-numeric: tabular-nums;
}

.details {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-md);
  padding: var(--ag-space-sm) var(--ag-space-lg) var(--ag-space-lg);
}

/* Подробности — карточками: серверы стоят рядом, пока хватает ширины. */
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

/* Время отклика — справа в шапке карточки: в ячейке таблицы ему тесно. */
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

.dns-table :deep(.dns-row--diff > td) {
  background: color-mix(in srgb, var(--ag-warn) 7%, transparent);
}

.dns-table :deep(.dns-row--diff > td:first-child) {
  box-shadow: inset 3px 0 0 var(--ag-warn);
}

.dns-table :deep(.dns-row--highlight > td) {
  animation: dns-row-flash 1.6s ease-out;
}

@keyframes dns-row-flash {
  from {
    background: color-mix(in srgb, var(--p-primary-color) 10%, transparent);
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

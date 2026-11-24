<script setup lang="ts">
// Таблица DNS: строки - домены, колонки - серверы.
//
// Компонент отвечает только за показ и раскрытие. Данные приходят готовыми:
// отфильтрованные строки, выбранные серверы и карта результатов. Поэтому
// таблица не решает, когда запускать проверку, - это дело `useDnslookup`.
//
// «Домен» и «Тип» закреплены слева: при большом числе серверов без этого
// теряется соответствие строки домену. Порядок строк - порядок добавления;
// при включённом `reorderable` строку переносят за свободное место домена
// (текст при этом выделяется мышью, как обычно). Сортировки нет: сравнение
// идёт построчно.
//
// Рамка, раскрытие, перенос строк и отступ закреплённой колонки живут
// в общем `ToolTable`: инструмент приносит только колонки и раскрытие.

import Button from "primevue/button";
import Column from "primevue/column";
import { t } from "@/core/infra/i18n";
import PlainSelect from "@/ui/PlainSelect.vue";
import ToolExpansionHead from "@/ui/tool/ToolExpansionHead.vue";
import ToolTable from "@/ui/tool/ToolTable.vue";
import {
  DOMAIN_COLUMN_MAX_WIDTH,
  DOMAIN_COLUMN_MIN_WIDTH,
  RECORD_TYPES,
  SERVER_COLUMN_MIN_WIDTH,
  SYSTEM_SERVER_ID,
} from "../constants";
import {
  extraAnswers,
  firstAnswer,
  statusClass,
  statusLabel,
  statusShown,
  verdictLabel,
} from "../cell";
import CellDetails from "./CellDetails.vue";
import type {
  CellDetailsEntry,
  DnsCell,
  DnsRow,
  RecordType,
  RowVerdict,
  ServerOption,
} from "../types";

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

/** Результат ячейки по паре «строка × сервер». */
function cellOf(rowId: string, serverId: string): DnsCell | undefined {
  return props.cells.get(`${rowId}:${serverId}`);
}

/** Подпись ячейки для чтения с экрана: сначала результат, потом статус. */
function cellLabel(server: ServerOption, cell: DnsCell | undefined): string {
  const value = firstAnswer(cell);
  const extra = extraAnswers(cell);
  const status = statusLabel(cell);

  let text = status;
  if (value) {
    text = extra > 0 ? t("dnslookup.table.cellExtra", { value, count: extra }) : value;
    text = `${text} (${status})`;
  }

  return t("dnslookup.table.cellLabel", { server: server.label, text });
}

/** Данные раскрытия: сервер и его результат, включая скрытые колонки. */
function detailsOf(rowId: string): CellDetailsEntry[] {
  return props.expansionServers.map((server) => ({
    server,
    cell: cellOf(rowId, server.id),
  }));
}

/** Подпись вердикта строки; без вердикта - пустая строка. */
function headVerdict(rowId: string): string {
  const verdict = props.verdicts.get(rowId);
  return verdict ? verdictLabel(verdict) : "";
}

/** Оформление вердикта: расхождение предупреждает, совпадение спокойно. */
function verdictClass(rowId: string): string {
  return props.verdicts.get(rowId)?.differs ? "dns-verdict dns-verdict--diff" : "dns-verdict";
}

/** Классы строки: расхождение и недавний дубликат. */
function rowClass(row: DnsRow): string {
  const classes: string[] = [];
  if (props.verdicts.get(row.id)?.differs) classes.push("dns-row--diff");
  if (props.highlightRowId === row.id) classes.push("dns-row--highlight");
  return classes.join(" ");
}

/** Тип меняется у строки, а не у копии пропса: значение приходит событием. */
function onTypeChange(rowId: string, event: { value: unknown }): void {
  emit("type-changed", rowId, event.value as RecordType);
}

/** Перенос строки приходит из общей таблицы и уходит экрану как есть. */
function forwardReorder(from: number, to: number): void {
  emit("reorder", from, to);
}
</script>

<template>
  <ToolTable
    class="dns-table"
    :rows="rows"
    :total="totalRows"
    :empty-add="t('dnslookup.table.emptyAdd')"
    :empty-filtered="t('dnslookup.table.emptyFiltered')"
    :highlight-id="highlightRowId"
    :row-class="rowClass"
    :reorderable="reorderable === true"
    mark-expanded
    @reorder="forwardReorder"
  >
    <template #notice>
      <slot name="notice" />
    </template>

    <template #default="{ isExpanded, toggle }">
      <!-- Ширина колонки — по содержимому: `width: 1%` не даёт таблице
           отдать домену лишнюю ширину. Кнопки стоят у правого края
           колонки, а пустота за текстом остаётся только у коротких имён.
           Нижнюю границу держит `minWidth`, потолок — `maxWidth`: длинное
           имя обрезается многоточием, а не тянет колонку. -->
      <Column
        field="name"
        frozen
        align-frozen="left"
        :style="{
          minWidth: DOMAIN_COLUMN_MIN_WIDTH,
          maxWidth: DOMAIN_COLUMN_MAX_WIDTH,
          width: '1%',
        }"
      >
        <template #header>
          <span class="tool-table__heading">
            <span>{{ t("dnslookup.table.domains") }}</span>
            <sup v-if="totalRows > 0" class="tool-table__count">{{ totalRows }}</sup>
          </span>
        </template>
        <template #body="{ data }">
          <div class="tool-table__cell">
            <div class="tool-table__row">
              <Button
                icon="pi pi-chevron-right"
                size="small"
                text
                severity="secondary"
                class="tool-table__expand"
                :class="{ 'tool-table__expand--open': isExpanded(data.id) }"
                :aria-expanded="isExpanded(data.id)"
                :aria-label="
                  isExpanded(data.id) ? t('dnslookup.table.collapse') : t('dnslookup.table.expand')
                "
                @click="toggle(data.id)"
              />
              <span class="tool-table__name" :data-tool-row="data.id">
                <span class="tool-table__name-text">{{ data.input }}</span>
              </span>
              <Button
                icon="pi pi-refresh"
                size="small"
                text
                severity="secondary"
                :aria-label="t('dnslookup.table.repeat')"
                :disabled="busy"
                @click.stop="emit('repeat', data.id)"
              />
              <Button
                icon="pi pi-trash"
                size="small"
                text
                severity="secondary"
                class="tool-table__delete"
                :aria-label="t('dnslookup.table.delete')"
                :disabled="busy"
                @click.stop="emit('delete', data.id)"
              />
            </div>
            <small v-if="data.name !== data.input" class="tool-table__normalized">
              {{ data.name }}
            </small>
          </div>
        </template>
      </Column>

      <Column
        field="type"
        :header="t('dnslookup.table.type')"
        frozen
        align-frozen="left"
        :style="{ minWidth: 'calc(var(--tool-compact-width) + 12px)' }"
      >
        <template #body="{ data }">
          <PlainSelect
            :model-value="data.type"
            :options="RECORD_TYPES"
            size="small"
            :style="{ width: 'var(--tool-compact-width)' }"
            :disabled="busy"
            :aria-label="t('dnslookup.table.typeAria', { name: data.input })"
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
    </template>

    <template #expansion-head="{ data, toggle }">
      <ToolExpansionHead
        :row-name="data.input"
        :collapse-label="t('dnslookup.table.collapseShort')"
        @collapse="toggle(data.id)"
      >
        <span
          v-if="headVerdict(data.id)"
          class="tool-table__expansion-status"
          :class="verdictClass(data.id)"
        >
          {{ headVerdict(data.id) }}
        </span>
      </ToolExpansionHead>
    </template>

    <template #expansion="{ data }">
      <CellDetails :entries="detailsOf(data.id)" />
    </template>
  </ToolTable>
</template>

<style scoped>
/* Вердикт строки: цвет различает совпадение и расхождение,
   подпись читается и без цвета. */
.dns-verdict {
  color: var(--ag-ok);
}

.dns-verdict--diff {
  color: var(--ag-warn);
}
</style>

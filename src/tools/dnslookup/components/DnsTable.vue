<script setup lang="ts">
// Таблица DNS: строки — домены, колонки — серверы.
//
// Компонент отвечает только за показ и раскрытие. Данные приходят готовыми:
// отфильтрованные строки, выбранные серверы и карта результатов. Поэтому
// таблица не решает, когда запускать проверку, — это дело `useDnslookup`.
//
// «Домен» и «Тип» закреплены слева: при большом числе серверов без этого
// теряется соответствие строки домену. Порядок строк — порядок добавления;
// при включённом `reorderable` строку переносят за свободное место домена
// (текст при этом выделяется мышью, как обычно). Сортировки нет: сравнение
// идёт построчно.

import Button from "primevue/button";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import { nextTick, onBeforeUnmount, onMounted, onUpdated, ref, watch } from "vue";
import { t } from "@/core/infra/i18n";
import PlainSelect from "@/ui/PlainSelect.vue";
import { useRowDrag } from "@/ui/rowDrag";
import {
  DOMAIN_COLUMN_MAX_WIDTH,
  DOMAIN_COLUMN_MIN_WIDTH,
  RECORD_TYPES,
  SERVER_COLUMN_MIN_WIDTH,
  SYSTEM_SERVER_ID,
  TYPE_COLUMN_MIN_WIDTH,
  TYPE_FIELD_WIDTH,
} from "../constants";
import { extraAnswers, firstAnswer, statusClass, statusLabel, statusShown } from "../cell";
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

/** Ширина закреплённых «Доменов»: от неё стоит отступ закреплённой «Тип». */
const domainWidth = ref("0px");

// Отступ закреплённой колонки PrimeVue считает один раз, при появлении
// ячеек, и при изменении ширины окна оставляет прежним: «Тип» уезжает на
// старую ширину «Доменов», оставляет зазор после них и накрывает первую
// серверную колонку. Ширина передаётся в стили при каждом изменении
// размера таблицы, поэтому отступ всегда равен текущей ширине «Доменов».
let resizeFrame = 0;

/** Пересчёт ширины «Доменов» по шапке таблицы. */
function syncFrozenOffset(): void {
  const header = root.value?.querySelector<HTMLElement>("thead th.p-datatable-frozen-column");
  const width = header ? `${header.getBoundingClientRect().width}px` : "0px";
  if (width !== domainWidth.value) domainWidth.value = width;
}

const resizeObserver = new ResizeObserver(() => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(syncFrozenOffset);
});

onMounted(() => {
  if (root.value) resizeObserver.observe(root.value);
  void nextTick(syncFrozenOffset);
});

// Ширина колонок меняется и без ресайза: смена набора серверов или строк
// переставляет их. После каждой такой перерисовки отступ сверяется заново.
onUpdated(syncFrozenOffset);

onBeforeUnmount(() => {
  resizeObserver.disconnect();
  cancelAnimationFrame(resizeFrame);
});

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

/** Строка раскрыта: шеврон развёрнут. */
function isExpanded(rowId: string): boolean {
  return expandedRows.value[rowId] === true;
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
      const marker = root.value?.querySelector<HTMLElement>(`[data-row-id="${rowId}"]`);
      marker?.closest("tr")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  },
  // Синхронно: повторная подсветка строки приходит как сброс и новое
  // значение в одном такте, и обычный watcher увидел бы только итог.
  { flush: "sync" },
);
</script>

<template>
  <div
    ref="root"
    class="dns-table"
    :class="{ 'dns-table--empty': rows.length === 0 }"
    :style="{ '--dns-domain-width': domainWidth }"
  >
    <slot name="notice" />
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
          <p v-if="totalRows === 0">{{ t("dnslookup.table.emptyAdd") }}</p>
          <p v-else>{{ t("dnslookup.table.emptyFiltered") }}</p>
        </div>
      </template>

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
          <span class="dns-table__domains">
            <span>{{ t("dnslookup.table.domains") }}</span>
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
                :aria-label="
                  isExpanded(data.id) ? t('dnslookup.table.collapse') : t('dnslookup.table.expand')
                "
                @click="toggle(data.id)"
              />
              <span class="dns-table__name" :data-row-id="data.id">{{ data.input }}</span>
              <Button
                icon="pi pi-refresh"
                size="small"
                text
                rounded
                severity="secondary"
                :aria-label="t('dnslookup.table.repeat')"
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
                :aria-label="t('dnslookup.table.delete')"
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
        :header="t('dnslookup.table.type')"
        frozen
        align-frozen="left"
        :style="{ minWidth: TYPE_COLUMN_MIN_WIDTH }"
      >
        <template #body="{ data }">
          <PlainSelect
            :model-value="data.type"
            :options="RECORD_TYPES"
            size="small"
            :style="{ width: TYPE_FIELD_WIDTH }"
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

      <template #expansion="{ data }">
        <CellDetails :entries="detailsOf(data.id)" />
      </template>
    </DataTable>
  </div>
</template>

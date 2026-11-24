<script setup lang="ts" generic="T extends { id: string }">
// Таблица инструмента: рамка, пустое состояние, раскрытие.
//
// Компонент держит то, что повторяется у DNSlookup и Ping: ref на корень,
// отступ второй закреплённой колонки, перенос строк, раскрытие и прокрутку
// к подсвеченной строке. Инструмент приносит строки, колонки и содержимое
// раскрытия.
//
// Раскрытие живёт здесь, а не в инструменте: шеврон и клик по имени должны
// менять одно состояние. Наружу оно отдаётся слотами: `default` получает
// `isExpanded` и `toggle`, `expansion-head` - строку и переключатель,
// `expansion` - строку.
//
// Подсветка ищет маркер `data-tool-row` внутри строки: сама строка PrimeVue
// не имеет идентификатора, а прокручивать нужно именно её.

import DataTable from "primevue/datatable";
import { nextTick, onBeforeUnmount, onMounted, onUpdated, ref, watch } from "vue";
import { useRowDrag } from "../rowDrag";

const props = withDefaults(
  defineProps<{
    rows: T[];
    /** Всего строк до фильтра: по нему различаются пустые состояния. */
    total: number;
    emptyAdd: string;
    emptyFiltered: string;
    /** Строка, к которой нужно прокрутить: маркер `data-tool-row`. */
    highlightId?: string | null;
    /** Классы строки: свой цвет и недавний дубликат. */
    rowClass?: (row: T) => string;
    /** Перенос строк перетаскиванием: включён, если не выключен явно. */
    reorderable?: boolean;
    /** Подсвечивать раскрытую строку: инструмент включает сам. */
    markExpanded?: boolean;
  }>(),
  {
    highlightId: null,
    rowClass: undefined,
    reorderable: true,
    markExpanded: false,
  },
);

const emit = defineEmits<{
  /** Новый порядок строк: индексы приходят после переноса. */
  reorder: [from: number, to: number];
}>();

/** Раскрытые строки: объект по идентификатору - так их ждёт DataTable. */
const expandedRows = ref<Record<string, boolean>>({});
const root = ref<HTMLElement | null>(null);

useRowDrag(root, {
  enabled: () => props.reorderable,
  grab: ".tool-table__cell",
  count: () => props.rows.length,
  reorder: (from, to) => emit("reorder", from, to),
});

/** Ширина первой закреплённой колонки: от неё стоит отступ второй. */
const frozenWidth = ref("0px");
let resizeFrame = 0;

/** Пересчёт отступа закреплённой колонки по шапке таблицы. */
function syncFrozenOffset(): void {
  const header = root.value?.querySelector<HTMLElement>("thead th.p-datatable-frozen-column");
  const width = header ? `${header.getBoundingClientRect().width}px` : "0px";
  if (width !== frozenWidth.value) frozenWidth.value = width;
}

const resizeObserver = new ResizeObserver(() => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(syncFrozenOffset);
});

onMounted(() => {
  if (root.value) resizeObserver.observe(root.value);
  void nextTick(syncFrozenOffset);
});

// Ширина меняется и без ресайза: новые строки и колонки переставляют содержимое.
onUpdated(syncFrozenOffset);

onBeforeUnmount(() => {
  resizeObserver.disconnect();
  cancelAnimationFrame(resizeFrame);
});

/** Строка раскрыта: шеврон развёрнут. */
function isExpanded(rowId: string): boolean {
  return expandedRows.value[rowId] === true;
}

/** Переключение раскрытия строки: имя и шеврон меняют одно состояние. */
function toggle(rowId: string): void {
  if (isExpanded(rowId)) {
    delete expandedRows.value[rowId];
  } else {
    expandedRows.value[rowId] = true;
  }
}

/** Классы строки: свои у инструмента и общий признак раскрытия. */
function rowClasses(row: T): string {
  const classes = [props.rowClass?.(row) ?? ""];
  if (isExpanded(row.id)) classes.push("tool-table__row--expanded");
  return classes.filter(Boolean).join(" ");
}

/** Прокрутка к строке с маркером `data-tool-row`. */
function scrollToRow(rowId: string): void {
  const markers = root.value?.querySelectorAll<HTMLElement>("[data-tool-row]");
  const marker = [...(markers ?? [])].find((item) => item.dataset.toolRow === rowId);
  marker?.closest("tr")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

// Дубликат подсвечивается, но может быть за пределами видимой области.
watch(
  () => props.highlightId,
  (rowId) => {
    if (!rowId) return;
    void nextTick(() => scrollToRow(rowId));
  },
  // Синхронно: повторная подсветка приходит как сброс и новое значение
  // в одном такте, и обычный watcher увидел бы только итог.
  { flush: "sync" },
);
</script>

<template>
  <div
    ref="root"
    class="tool-table"
    :class="{
      'tool-table--empty': rows.length === 0,
      'tool-table--mark-expanded': markExpanded,
    }"
    :style="{ '--tool-frozen-offset': frozenWidth }"
  >
    <slot name="notice" />
    <DataTable
      v-model:expanded-rows="expandedRows"
      :value="rows"
      data-key="id"
      :row-class="rowClasses"
      scrollable
      size="small"
    >
      <template #empty>
        <div class="tool-table__empty">
          <i class="pi pi-search" aria-hidden="true" />
          <p>{{ total === 0 ? emptyAdd : emptyFiltered }}</p>
        </div>
      </template>

      <slot :is-expanded="isExpanded" :toggle="toggle" />

      <template #expansion="scope">
        <div class="tool-table__expansion">
          <slot name="expansion-head" v-bind="{ ...scope, isExpanded, toggle }" />
          <slot name="expansion" v-bind="scope" />
        </div>
      </template>
    </DataTable>
  </div>
</template>

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
    /** Черновик открыт: над первой строкой рисуется полоса формы. */
    draftOpen?: boolean;
  }>(),
  {
    highlightId: null,
    rowClass: undefined,
    reorderable: true,
    markExpanded: false,
    draftOpen: false,
  },
);

const emit = defineEmits<{
  /** Новый порядок строк: индексы приходят после переноса. */
  reorder: [from: number, to: number];
}>();

/** Раскрытые строки: объект по идентификатору - так их ждёт DataTable. */
const expandedRows = ref<Record<string, boolean>>({});
const root = ref<HTMLElement | null>(null);
const draftBanner = ref<HTMLElement | null>(null);

useRowDrag(root, {
  enabled: () => props.reorderable,
  // Зона захвата - вся первая ячейка, а не только её содержимое: строка
  // тянется и за поля ячейки, куда не попадает текст или контрол.
  grab: "td:first-child",
  count: () => props.rows.length,
  reorder: (from, to) => emit("reorder", from, to),
});

/** Ширина первой закреплённой колонки: от неё стоит отступ второй. */
const frozenWidth = ref("0px");
let resizeFrame = 0;
let draftFrame = 0;

/** Пересчёт отступа закреплённой колонки по шапке таблицы. */
function syncFrozenOffset(): void {
  const header = root.value?.querySelector<HTMLElement>("thead th.p-datatable-frozen-column");
  const width = header ? `${header.getBoundingClientRect().width}px` : "0px";
  if (width !== frozenWidth.value) frozenWidth.value = width;
}

/** Контейнер прокрутки таблицы: у него видны границы и ширина. */
function tableScroller(): HTMLElement | null {
  return root.value?.querySelector<HTMLElement>(".p-datatable-table-container") ?? null;
}

/**
 * Полоса черновика встаёт поверх первой строки.
 *
 * Строка черновика пустая и служит только запасом высоты: её высоту задаёт
 * измеренная полоса, поэтому ошибка растёт вниз, не наезжая на данные.
 * Слева и по ширине полоса повторяет видимую часть таблицы, так что кнопки
 * не уезжают при горизонтальной прокрутке.
 */
function syncDraft(): void {
  const banner = draftBanner.value;
  const rootEl = root.value;
  if (!banner || !rootEl) return;

  const row = rootEl.querySelector<HTMLElement>("tbody tr.tool-table__row--draft");
  const scroller = tableScroller();
  if (!row || !scroller) return;

  const rootRect = rootEl.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();

  // Абсолютная полоса отсчитывается от внутреннего края рамки таблицы,
  // а не от внешнего: без поправки на рамку она уезжает на пиксель.
  banner.style.top = `${rowRect.top - rootRect.top - rootEl.clientTop}px`;
  banner.style.left = `${scrollerRect.left - rootRect.left - rootEl.clientLeft}px`;
  banner.style.width = `${scroller.clientWidth}px`;

  const height = `${banner.offsetHeight}px`;
  if (row.style.height !== height) row.style.height = height;
}

/** Пересчёт полосы в следующем кадре: обновления идут пачкой. */
function scheduleDraft(): void {
  cancelAnimationFrame(draftFrame);
  draftFrame = requestAnimationFrame(syncDraft);
}

const resizeObserver = new ResizeObserver(() => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    syncFrozenOffset();
    syncDraft();
  });
});

/** Полоса меняет высоту от ошибки: строку нужно догонять сразу. */
const draftObserver = new ResizeObserver(scheduleDraft);

watch(draftBanner, (current, previous) => {
  if (previous) draftObserver.unobserve(previous);
  if (current) draftObserver.observe(current);
});

// Черновик стоит первой строкой: открытие возвращает таблицу к началу,
// иначе форма осталась бы за верхним краем прокрутки.
watch(
  () => props.draftOpen,
  (open) => {
    if (!open) return;
    void nextTick(() => {
      tableScroller()?.scrollTo({ top: 0 });
      scheduleDraft();
    });
  },
);

/** Прокрутка двигает строку под полосой: её верх идёт следом. */
let scroller: HTMLElement | null = null;

function bindScroller(): void {
  const next = tableScroller();
  if (next === scroller) return;
  scroller?.removeEventListener("scroll", scheduleDraft);
  scroller = next;
  scroller?.addEventListener("scroll", scheduleDraft, { passive: true });
}

onMounted(() => {
  if (root.value) resizeObserver.observe(root.value);
  void nextTick(() => {
    syncFrozenOffset();
    bindScroller();
    scheduleDraft();
  });
});

// Ширина меняется и без ресайза: новые строки и колонки переставляют содержимое.
onUpdated(() => {
  syncFrozenOffset();
  bindScroller();
  scheduleDraft();
});

onBeforeUnmount(() => {
  resizeObserver.disconnect();
  draftObserver.disconnect();
  scroller?.removeEventListener("scroll", scheduleDraft);
  cancelAnimationFrame(resizeFrame);
  cancelAnimationFrame(draftFrame);
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
      'tool-table--reorderable': reorderable,
    }"
    :style="{ '--tool-frozen-offset': frozenWidth }"
  >
    <slot name="notice" />

    <!-- Полоса черновика: форма на всю видимую ширину таблицы. Стоит в начале
         разметки, чтобы порядок обхода совпадал с верхом таблицы. -->
    <div v-if="draftOpen" ref="draftBanner" class="tool-table__draft-banner">
      <slot name="draft" />
    </div>

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

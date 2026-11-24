<script setup lang="ts">
// Журнал отдельной вкладкой.
//
// Журнал - общий поток фактов: он живёт в core и не зависит от вкладки
// или профиля. Здесь только показ; запись и потолок - в
// `core/infra/journal.ts`, а условия показа и пауза - в `useJournalView`.
//
// Новые записи сверху, пока список у начала: прокрутка останавливает ленту,
// чтобы чтение не сдвигалось.

import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import InputText from "primevue/inputtext";
import MultiSelect from "primevue/multiselect";
import { useConfirm } from "primevue/useconfirm";
import { computed, ref } from "vue";
import { JOURNAL_LIMIT } from "@/core/infra/constants";
import { t } from "@/core/infra/i18n";
import { clearJournal, journalText, journalSource, type JournalKind } from "@/core/infra/journal";
import { requireConfirm } from "@/ui/primevue/popup/confirmPopup";
import { highlightParts } from "./journalList";
import { useJournalView } from "./useJournalView";

const confirm = useConfirm();

const {
  view,
  pending,
  rows,
  shown,
  total,
  liveTotal,
  truncated,
  sourceOptions,
  time,
  dayLabel,
  resume,
  onScroll,
  toggleOrder,
} = useJournalView();

/** Прокрутка ленты: к началу возвращает и кнопка «Продолжить». */
const scroller = ref<HTMLElement | null>(null);

/** Вид записи - только цвет точки: отказ красный, итог зелёный, ход серый. */
const TONE: Record<JournalKind, string> = {
  info: "",
  result: "journal__dot--ok",
  error: "journal__dot--danger",
};

/** Текущий порядок словом: подпись у иконки переключателя. */
const orderLabel = computed(() =>
  view.order === "newest" ? t("journal.order.newestFirst") : t("journal.order.oldestFirst"),
);

/** Действие переключателя порядка: подсказка при наведении. */
const orderAction = computed(() =>
  view.order === "newest" ? t("journal.order.toOldest") : t("journal.order.toNewest"),
);

/** Возвращает ленту к началу и снимает паузу. */
function resumeToTop(): void {
  scroller.value?.scrollTo({ top: 0 });
  resume();
}

/** Спрашивает подтверждение очистки всплывающим блоком у кнопки. */
function requestClear(event: MouseEvent): void {
  requireConfirm(confirm, {
    target: event.currentTarget as HTMLElement,
    message: t("journal.clear.message"),
    acceptLabel: t("common.clear"),
    rejectLabel: t("common.cancel"),
    accept: () => {
      clearJournal();
      // Лента могла стоять на паузе со снимком: его тоже пора отпустить,
      // иначе очистка оставила бы строки на экране.
      resume();
    },
  });
}
</script>

<template>
  <section class="journal wb-screen">
    <header class="wb-screen__head journal__head">
      <h1 class="wb-screen__title">{{ t("common.journal") }}</h1>
      <span v-if="total > 0" class="journal__shown">
        {{ t("journal.view.shown", { shown, total }) }}
      </span>
    </header>

    <div class="wb-screen__body">
      <div class="journal__filters">
        <InputText
          v-model="view.query"
          class="journal__search"
          size="small"
          :placeholder="t('journal.view.search')"
          :aria-label="t('journal.view.search')"
        />

        <MultiSelect
          v-model="view.sources"
          class="journal__sources"
          :options="sourceOptions"
          option-label="label"
          option-value="source"
          display="chip"
          size="small"
          :placeholder="t('journal.view.allSources')"
          :aria-label="t('journal.view.sourceFilter')"
        />

        <Button
          class="journal__order"
          :icon="view.order === 'newest' ? 'pi pi-sort-amount-down' : 'pi pi-sort-amount-up-alt'"
          :label="orderLabel"
          v-tooltip.bottom="orderAction"
          severity="secondary"
          text
          size="small"
          @click="toggleOrder"
        />

        <label class="journal__check">
          <Checkbox v-model="view.onlyErrors" binary />
          <span>{{ t("journal.view.onlyErrors") }}</span>
        </label>

        <Button
          class="journal__clear"
          :label="t('common.clear')"
          icon="pi pi-trash"
          severity="danger"
          text
          size="small"
          :disabled="!liveTotal"
          @click="requestClear"
        />
      </div>

      <p v-if="truncated" class="journal__meta">
        {{ t("journal.view.limit", { count: JOURNAL_LIMIT }) }}
      </p>

      <div ref="scroller" class="journal__scroll" @scroll.passive="onScroll">
        <div v-if="pending > 0" class="journal__pending">
          <span>{{ t("journal.view.pending", { count: pending }) }}</span>
          <Button size="small" text :label="t('journal.view.resume')" @click="resumeToTop" />
        </div>

        <ul v-if="rows.length > 0" class="journal__list">
          <template
            v-for="row in rows"
            :key="row.type === 'day' ? `day-${row.dayKey}` : row.entry.id"
          >
            <li v-if="row.type === 'day'" class="journal__day">{{ dayLabel(row.dayKey) }}</li>
            <li v-else class="journal__row">
              <time class="journal__time">{{ time(row.entry.at) }}</time>
              <span class="journal__source">{{ journalSource(row.entry.source) }}</span>
              <span class="journal__text">
                <i class="journal__dot" :class="TONE[row.entry.kind]" aria-hidden="true" />
                <template
                  v-for="(part, index) in highlightParts(journalText(row.entry), view.query)"
                  :key="index"
                >
                  <mark v-if="part.match" class="journal__match">{{ part.text }}</mark>
                  <template v-else>{{ part.text }}</template>
                </template>
              </span>
              <span v-if="row.entry.kind === 'error'" class="journal__kind">
                {{ t("common.error") }}
              </span>
            </li>
          </template>
        </ul>

        <p v-else class="journal__empty">
          {{ total ? t("journal.view.emptyFiltered") : t("journal.view.empty") }}
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.journal {
  padding: var(--ag-space-lg);
}

.journal__head {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: var(--ag-space-md);
}

.journal__shown {
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.journal__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ag-space-md);
}

.journal__search {
  width: 240px;
}

.journal__sources {
  min-width: 200px;
}

.journal__check {
  display: flex;
  align-items: center;
  gap: var(--ag-space-sm);
  font-size: var(--ag-text-sm);
  cursor: pointer;
}

.journal__meta {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.journal__scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.journal__pending {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ag-space-lg);
  padding: var(--ag-space-xs) var(--ag-space-sm);
  border-bottom: 1px solid var(--ag-border);
  background: var(--ag-surface);
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.journal__list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.journal__day {
  padding: var(--ag-space-sm) 0 var(--ag-space-xs);
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
  font-weight: 600;
}

.journal__row {
  display: flex;
  align-items: baseline;
  gap: var(--ag-space-lg);
  padding: var(--ag-space-sm) 0;
  border-bottom: 1px solid var(--ag-border);
  font-size: var(--ag-text-sm);
}

.journal__dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-inline-end: var(--ag-space-sm);
  border-radius: var(--ag-radius-round);
  background: var(--p-surface-400);
  vertical-align: middle;
}

.journal__dot--ok {
  background: var(--ag-ok);
}

.journal__dot--danger {
  background: var(--ag-danger);
}

.journal__time {
  flex-shrink: 0;
  width: 96px;
  color: var(--p-text-muted-color);
  font-family: var(--ag-font-mono);
  font-size: var(--ag-text-xs);
  font-variant-numeric: tabular-nums;
}

.journal__source {
  flex-shrink: 0;
  width: 120px;
  overflow: hidden;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.journal__text {
  flex: 1 1 auto;
  min-width: 0;
  overflow-wrap: anywhere;
}

.journal__match {
  border-radius: var(--ag-radius-sm);
  background: var(--p-highlight-background);
  color: var(--p-highlight-color);
  font-weight: 600;
}

.journal__kind {
  flex-shrink: 0;
  color: var(--ag-danger);
  font-size: var(--ag-text-xs);
  font-weight: 600;
}

.journal__empty {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-sm);
}
</style>

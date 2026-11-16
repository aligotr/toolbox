<script setup lang="ts">
// Журнал отдельной вкладкой.
//
// Журнал — общий поток фактов: он живёт в core и не зависит от открытой
// вкладки или профиля. Здесь только показ; запись и предел 200 строк —
// в `core/infra/journal.ts`.
//
// Новые записи сверху: свежее важнее старого. Фильтр по виду — это взгляд
// на тот же поток, а не отдельное хранилище.

import Button from "primevue/button";
import DataView from "primevue/dataview";
import SelectButton from "primevue/selectbutton";
import { computed, ref } from "vue";
import { t } from "@/core/infra/i18n";
import { clearJournal, journal, type JournalKind } from "@/core/infra/journal";

/** Один вариант фильтра. */
interface KindOption {
  label: string;
  value: JournalKind;
}

/** Все виды записей: по умолчанию включены. */
const ALL_KINDS: JournalKind[] = ["info", "result", "error"];

/** Три переключателя видов; подписи читаются из словаря при показе. */
const kindOptions = computed<KindOption[]>(() => [
  { label: t("journal.filter.info"), value: "info" },
  { label: t("journal.filter.result"), value: "result" },
  { label: t("journal.filter.error"), value: "error" },
]);

/** Вид записи человеческим словом. */
const kindLabels = computed<Record<JournalKind, string>>(() => ({
  info: t("journal.kind.info"),
  result: t("journal.kind.result"),
  error: t("journal.kind.error"),
}));

/** Вид записи — только цвет точки: ошибка красная, ответ зелёный, факт серый. */
const KIND_TONE: Record<JournalKind, "muted" | "ok" | "danger"> = {
  info: "muted",
  result: "ok",
  error: "danger",
};

const selectedKinds = ref<JournalKind[]>([...ALL_KINDS]);

const entries = computed(() => journal.entries);

/** Видимые записи: фильтр не меняет сам журнал. */
const visibleEntries = computed(() =>
  entries.value.filter((entry) => selectedKinds.value.includes(entry.kind)),
);

function time(at: number): string {
  return new Date(at).toLocaleTimeString();
}
</script>

<template>
  <section class="journal wb-section">
    <header class="journal__head">
      <div class="wb-screen__head">
        <h1 class="wb-screen__title">{{ t("journal.view.title") }}</h1>
        <p class="wb-screen__lead">{{ t("journal.view.lead") }}</p>
      </div>

      <div class="journal__actions">
        <SelectButton
          v-model="selectedKinds"
          :options="kindOptions"
          option-label="label"
          option-value="value"
          multiple
          size="small"
          :aria-label="t('journal.view.filter')"
        />
        <Button
          :label="t('journal.view.clear')"
          icon="pi pi-trash"
          text
          size="small"
          :disabled="!entries.length"
          @click="clearJournal"
        />
      </div>
    </header>

    <DataView class="journal__view" :value="visibleEntries" layout="list">
      <template #list>
        <ul class="journal__list">
          <li v-for="entry in visibleEntries" :key="entry.id" class="journal__row">
            <time class="journal__time">{{ time(entry.at) }}</time>
            <span class="journal__kind">
              <i class="journal__dot" :class="`journal__dot--${KIND_TONE[entry.kind]}`" />
              {{ kindLabels[entry.kind] }}
            </span>
            <span class="journal__source">{{ entry.source }}</span>
            <span class="journal__text">{{ entry.text }}</span>
          </li>
        </ul>
      </template>

      <template #empty>
        <p class="journal__empty">
          {{ entries.length ? t("journal.view.emptyFiltered") : t("journal.view.empty") }}
        </p>
      </template>
    </DataView>
  </section>
</template>

<style scoped>
.journal {
  height: 100%;
  padding: var(--ag-space-2xl);
}

.journal__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--ag-space-lg);
}

.journal__actions {
  display: flex;
  align-items: center;
  gap: var(--ag-space-lg);
}

.journal__view {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 0;
  padding: 0;
}

.journal__view :deep(.p-dataview-content) {
  padding: 0;
  border: 0;
  background: transparent;
}

.journal__list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.journal__row {
  display: flex;
  align-items: baseline;
  gap: var(--ag-space-lg);
  padding: var(--ag-space-sm) 0;
  border-bottom: 1px solid var(--ag-border);
  font-size: var(--ag-text-sm);
}

.journal__time {
  flex-shrink: 0;
  width: 80px;
  color: var(--p-text-muted-color);
  font-family: var(--ag-font-mono);
  font-size: var(--ag-text-xs);
}

.journal__kind {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: var(--ag-space-sm);
  width: 88px;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.journal__dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: var(--ag-radius-round);
  background: var(--p-surface-400);
}

.journal__dot--ok {
  background: var(--ag-ok);
}

.journal__dot--danger {
  background: var(--ag-danger);
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
  min-width: 0;
  overflow-wrap: anywhere;
}

.journal__empty {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-sm);
}
</style>

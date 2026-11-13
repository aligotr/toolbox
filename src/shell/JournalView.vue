<script setup lang="ts">
// Журнал отдельной вкладкой.
//
// Журнал — общий поток фактов: он живёт в core и не зависит от открытой
// вкладки или профиля. Здесь только показ; запись и предел 200 строк —
// в `core/journal.ts`.
//
// Новые записи сверху: свежее важнее старого. Фильтр по виду — это взгляд
// на тот же поток, а не отдельное хранилище.

import Button from "primevue/button";
import DataView from "primevue/dataview";
import SelectButton from "primevue/selectbutton";
import { computed, ref } from "vue";
import { clearJournal, journal, type JournalKind } from "../core/journal";

/** Один вариант фильтра. */
interface KindOption {
  label: string;
  value: JournalKind;
}

/** Три переключателя видов: по умолчанию включены все. */
const KIND_OPTIONS: KindOption[] = [
  { label: "Факт", value: "info" },
  { label: "Ответ", value: "result" },
  { label: "Ошибка", value: "error" },
];

/** Вид записи человеческим словом. */
const KIND_LABELS: Record<JournalKind, string> = {
  info: "факт",
  result: "ответ",
  error: "ошибка",
};

/** Вид записи — только цвет точки: ошибка красная, ответ зелёный, факт серый. */
const KIND_TONE: Record<JournalKind, "muted" | "ok" | "danger"> = {
  info: "muted",
  result: "ok",
  error: "danger",
};

const selectedKinds = ref<JournalKind[]>(KIND_OPTIONS.map((option) => option.value));

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
  <section class="journal">
    <header class="journal__head">
      <div class="journal__heading">
        <h1 class="journal__title">Журнал</h1>
        <p class="journal__lead">Что делала программа: факты, ответы и ошибки.</p>
      </div>

      <div class="journal__actions">
        <SelectButton
          v-model="selectedKinds"
          :options="KIND_OPTIONS"
          option-label="label"
          option-value="value"
          multiple
          size="small"
          aria-label="Фильтр по виду записи"
        />
        <Button
          label="Очистить"
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
              {{ KIND_LABELS[entry.kind] }}
            </span>
            <span class="journal__source">{{ entry.source }}</span>
            <span class="journal__text">{{ entry.text }}</span>
          </li>
        </ul>
      </template>

      <template #empty>
        <p class="journal__empty">
          {{ entries.length ? "Нет записей выбранного вида." : "Записей пока нет." }}
        </p>
      </template>
    </DataView>
  </section>
</template>

<style scoped>
.journal {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  padding: 32px;
}

.journal__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.journal__heading {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.journal__title {
  margin: 0;
  font-size: 24px;
  line-height: 1.25;
}

.journal__lead {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 15px;
}

.journal__actions {
  display: flex;
  align-items: center;
  gap: 16px;
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
  gap: 16px;
  padding: 8px 0;
  border-bottom: 1px solid var(--ag-border);
  font-size: 14px;
}

.journal__time {
  flex-shrink: 0;
  width: 80px;
  color: var(--p-text-muted-color);
  font-family: var(--ag-font-mono);
  font-size: 13px;
}

.journal__kind {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
  width: 88px;
  color: var(--p-text-muted-color);
  font-size: 13px;
}

.journal__dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
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
  font-size: 13px;
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
  font-size: 14px;
}
</style>

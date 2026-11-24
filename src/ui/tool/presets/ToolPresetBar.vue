<script setup lang="ts">
// Панель пресета в шапке инструмента.
//
// Имя пресета - это и подпись кнопки, и состояние сеанса, поэтому кнопка
// одновременно показывает, с чем работает сеанс, и открывает список.
// Быстрые действия появляются только при расхождении настроек: постоянные
// кнопки сохранения и отката отвлекали бы, когда сохранять нечего.
//
// Открытие списка - событие: диалог принадлежит экрану, а не панели.
// Операции сохранения и отката приносит инструмент: панель отвечает только
// за вид и заметку о неудаче.

import Button from "primevue/button";
import { computed } from "vue";
import { describeError } from "@/core/infra/errors";
import { t } from "@/core/infra/i18n";
import type { Preset } from "@/core/services/presets";
import type { PresetBarTexts } from "./types";

const props = defineProps<{
  /** Имя инструмента в заголовке экрана. */
  title: string;
  presetTitle: string | null;
  /** Настройки разошлись с сохранённым пресетом. */
  changed: boolean;
  /** Идёт сохранение изменений. */
  saving: boolean;
  /** Причина прошлого отказа сохранения; `null` - её нет. */
  saveError: string | null;
  texts: PresetBarTexts;
  save(): Promise<Preset | null>;
  revert(): Promise<{ error: string | null }>;
}>();

const emit = defineEmits<{
  open: [];
  note: [text: string | null];
}>();

/** Загруженный пресет называет себя сам; без пресета кнопка - вход в список. */
const label = computed(() => props.presetTitle ?? t(props.texts.buttonEmpty));

/** Быстрое сохранение изменений в открытый пресет. */
async function saveChanges(): Promise<void> {
  emit("note", null);
  const saved = await props.save();
  if (!saved) {
    emit("note", props.saveError ?? t(props.texts.notSaved));
  }
}

/** Откат правок: источник - снимок открытого пресета, файл не читается. */
async function revertEdits(): Promise<void> {
  emit("note", null);
  try {
    const result = await props.revert();
    if (result.error) emit("note", result.error);
  } catch (error) {
    emit("note", t(props.texts.revertFailed, { reason: describeError(error) }));
  }
}
</script>

<template>
  <header class="tool__head">
    <h1 class="tool__title">{{ title }}</h1>

    <div class="tool__preset-bar">
      <div class="tool__preset-state" :class="{ 'tool__preset-state--hidden': !changed }">
        <span class="tool__preset-changed">{{ t(texts.changed) }}</span>
        <Button
          v-tooltip.top="t(texts.revertHint)"
          icon="pi pi-undo"
          severity="secondary"
          text
          size="small"
          :aria-label="t(texts.revertHint)"
          @click="revertEdits"
        />
        <Button
          v-tooltip.top="t(texts.saveHint)"
          icon="pi pi-save"
          severity="secondary"
          text
          size="small"
          :aria-label="t(texts.saveHint)"
          :loading="saving"
          @click="saveChanges"
        />
      </div>
      <Button
        class="tool__preset-button"
        :label="label"
        :icon="presetTitle ? 'pi pi-bookmark-fill' : 'pi pi-bookmark'"
        severity="secondary"
        outlined
        size="small"
        @click="emit('open')"
      />
    </div>
  </header>
</template>

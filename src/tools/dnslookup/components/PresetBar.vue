<script setup lang="ts">
// Шапка экрана DNS: название инструмента и управление пресетом.
//
// Имя пресета — это и подпись кнопки, и состояние сеанса, поэтому кнопка
// одновременно показывает, с чем работает сеанс, и открывает список.
// Быстрые действия появляются только при расхождении настроек: постоянные
// кнопки сохранения и отката отвлекали бы, когда сохранять нечего.
//
// Открытие списка — событие: диалог принадлежит экрану, а не шапке.
// Замечание о неудачном сохранении возвращается тем же событием `note`.

import Button from "primevue/button";
import { computed } from "vue";
import { describeError } from "@/core/infra/errors";
import { t } from "@/core/infra/i18n";
import { TOOL_TITLE } from "../constants";
import { dnsPresetChanged, dnsPresets, revertPresetChanges, savePresetToCurrent } from "../presets";
import type { DnsSession } from "../types";

const props = defineProps<{ session: DnsSession }>();

const emit = defineEmits<{
  open: [];
  note: [text: string | null];
}>();

/** Настройки разошлись с сохранённым пресетом: подпись у кнопки. */
const changed = computed(() => dnsPresetChanged(props.session));

/** Загруженный пресет называет себя сам; без пресета кнопка — вход в список. */
const label = computed(() => props.session.presetTitle ?? t("dnslookup.preset.buttonEmpty"));

function report(text: string | null): void {
  emit("note", text);
}

/** Быстрое сохранение изменений в открытый пресет. */
async function saveChanges(): Promise<void> {
  report(null);
  const saved = await savePresetToCurrent(props.session);
  if (!saved) {
    report(dnsPresets.status.update.error ?? t("dnslookup.preset.notSaved"));
  }
}

/** Откат правок: источник — снимок открытого пресета, файл не читается. */
async function revertEdits(): Promise<void> {
  report(null);
  try {
    const result = await revertPresetChanges(props.session);
    if (result.error) report(result.error);
  } catch (error) {
    report(t("dnslookup.preset.revertFailed", { reason: describeError(error) }));
  }
}
</script>

<template>
  <header class="dns__head">
    <h1 class="dns__title">{{ TOOL_TITLE }}</h1>

    <div class="dns__preset-bar">
      <div class="dns__preset-state" :class="{ 'dns__preset-state--hidden': !changed }">
        <span class="dns__preset-changed">{{ t("dnslookup.preset.changed") }}</span>
        <Button
          v-tooltip.top="t('dnslookup.preset.revertHint')"
          icon="pi pi-undo"
          severity="secondary"
          text
          rounded
          size="small"
          :aria-label="t('dnslookup.preset.revertHint')"
          @click="revertEdits"
        />
        <Button
          v-tooltip.top="t('dnslookup.preset.saveHint')"
          icon="pi pi-save"
          severity="secondary"
          text
          rounded
          size="small"
          :aria-label="t('dnslookup.preset.saveHint')"
          :loading="dnsPresets.status.update.loading"
          @click="saveChanges"
        />
      </div>
      <Button
        class="dns__preset-button"
        :label="label"
        :icon="session.presetTitle ? 'pi pi-bookmark-fill' : 'pi pi-bookmark'"
        severity="secondary"
        outlined
        size="small"
        @click="emit('open')"
      />
    </div>
  </header>
</template>

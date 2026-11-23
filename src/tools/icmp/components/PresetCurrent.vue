<script setup lang="ts">
// Текущий пресет Ping: с чем работает сеанс и что с этим можно сделать.
//
// Блок отвечает только за показ и две кнопки: откат и сохранение изменений.
// Источник настроек - снимок в `presets/`, поэтому здесь нет ни файлов,
// ни разбора payload.

import Button from "primevue/button";
import { t } from "@/core/infra/i18n";

defineProps<{
  /** Сеанс привязан к пресету. */
  bound: boolean;
  title: string | null;
  /** Настройки разошлись с сохранённым пресетом. */
  changed: boolean;
  /** Идёт сохранение изменений. */
  loading: boolean;
}>();

const emit = defineEmits<{
  revert: [];
  save: [];
}>();
</script>

<template>
  <section class="presets__current">
    <div class="presets__current-text">
      <template v-if="bound">
        <span class="presets__current-title">{{ title }}</span>
        <small v-if="changed" class="presets__current-state presets__current-state--changed">
          {{ t("icmp.preset.currentChanged") }}
        </small>
      </template>
      <template v-else>
        <span class="presets__current-title">{{ t("icmp.preset.none") }}</span>
        <small class="presets__current-state">
          {{ t("icmp.preset.noneHint") }}
        </small>
      </template>
    </div>
    <div v-if="bound" class="presets__current-actions">
      <Button
        v-tooltip.top="t('icmp.preset.revertHint')"
        icon="pi pi-undo"
        severity="secondary"
        text
        size="small"
        :aria-label="t('icmp.preset.revertHint')"
        :disabled="!changed"
        @click="emit('revert')"
      />
      <Button
        :label="t('icmp.preset.saveChanges')"
        icon="pi pi-save"
        size="small"
        :loading="loading"
        :disabled="!changed"
        @click="emit('save')"
      />
    </div>
  </section>
</template>

<style scoped>
.presets__current {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ag-space-md);
  padding: var(--ag-space-sm) var(--ag-space-md);
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius);
}

.presets__current-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.presets__current-title {
  font-weight: 600;
}

.presets__current-state {
  color: var(--ag-text-muted);
}

.presets__current-state--changed {
  color: var(--ag-warn);
}

.presets__current-actions {
  display: flex;
  align-items: center;
  gap: var(--ag-space-sm);
}
</style>

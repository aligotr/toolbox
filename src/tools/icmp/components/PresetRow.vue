<script setup lang="ts">
// Строка списка пресетов Ping.
//
// Показ и действия строки отделены от диалога: список, создание и откат
// живут в `PresetsDialog`, а здесь только одна запись со своими кнопками.
// Так диалог остаётся читаемым при том же наборе операций.

import Button from "primevue/button";
import InputText from "primevue/inputtext";
import { t } from "@/core/infra/i18n";
import { PRESET_TITLE_MAX_LENGTH } from "@/core/services/presets/constants";
import type { Preset } from "@/core/services/presets";

const props = defineProps<{
  preset: Preset;
  isDefault: boolean;
  renaming: boolean;
  renameTitle: string;
  savedAt: string;
  loading: boolean;
}>();

const emit = defineEmits<{
  load: [event: MouseEvent];
  "toggle-default": [];
  "start-rename": [];
  "submit-rename": [];
  "cancel-rename": [];
  duplicate: [];
  delete: [event: MouseEvent];
  "update:renameTitle": [value: string];
}>();

/** Подпись звёздочки: действие зависит от текущей отметки. */
function defaultLabel(): string {
  return props.isDefault ? t("icmp.preset.clearDefault") : t("icmp.preset.makeDefault");
}
</script>

<template>
  <li class="preset-row">
    <template v-if="renaming">
      <InputText
        :model-value="renameTitle"
        class="preset-row__rename"
        size="small"
        :maxlength="PRESET_TITLE_MAX_LENGTH"
        :aria-label="t('icmp.preset.renameAria')"
        @update:model-value="emit('update:renameTitle', $event)"
        @keyup.enter="emit('submit-rename')"
      />
      <Button
        icon="pi pi-check"
        size="small"
        text
        :aria-label="t('icmp.preset.renameSave')"
        @click="emit('submit-rename')"
      />
      <Button
        icon="pi pi-times"
        severity="secondary"
        size="small"
        text
        :aria-label="t('icmp.preset.renameCancel')"
        @click="emit('cancel-rename')"
      />
    </template>
    <template v-else>
      <button
        type="button"
        class="preset-row__open"
        :aria-label="t('icmp.preset.loadAria', { title: preset.title })"
        @click="emit('load', $event)"
      >
        <span class="preset-row__title-row">
          <span class="preset-row__title">{{ preset.title }}</span>
          <span v-if="isDefault" class="preset-row__default">
            {{ t("icmp.preset.badgeDefault") }}
          </span>
        </span>
        <small class="preset-row__meta">{{ savedAt }}</small>
      </button>
      <div class="preset-row__actions">
        <Button
          v-tooltip.top="defaultLabel()"
          :icon="isDefault ? 'pi pi-star-fill' : 'pi pi-star'"
          :severity="isDefault ? 'warn' : 'secondary'"
          size="small"
          text
          :aria-label="defaultLabel()"
          :loading="loading"
          @click="emit('toggle-default')"
        />
        <Button
          v-tooltip.top="t('icmp.preset.loadTip')"
          icon="pi pi-upload"
          severity="secondary"
          size="small"
          text
          :aria-label="t('icmp.preset.loadTipAria')"
          @click="emit('load', $event)"
        />
        <Button
          v-tooltip.top="t('icmp.preset.renameTip')"
          icon="pi pi-pencil"
          severity="secondary"
          size="small"
          text
          :aria-label="t('icmp.preset.renameTipAria')"
          @click="emit('start-rename')"
        />
        <Button
          v-tooltip.top="t('icmp.preset.duplicateTip')"
          icon="pi pi-copy"
          severity="secondary"
          size="small"
          text
          :aria-label="t('icmp.preset.duplicateAria')"
          @click="emit('duplicate')"
        />
        <Button
          v-tooltip.top="t('icmp.preset.deleteTip')"
          icon="pi pi-trash"
          severity="danger"
          size="small"
          text
          :aria-label="t('icmp.preset.deleteAria')"
          @click="emit('delete', $event)"
        />
      </div>
    </template>
  </li>
</template>

<style scoped>
.preset-row {
  display: flex;
  align-items: center;
  gap: var(--ag-space-sm);
  padding: var(--ag-space-sm);
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius);
}

.preset-row__open {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.preset-row__title-row {
  display: flex;
  align-items: center;
  gap: var(--ag-space-sm);
  min-width: 0;
}

.preset-row__title {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preset-row__default {
  flex: none;
  padding: 0 var(--ag-space-sm);
  border-radius: 999px;
  background: var(--ag-warn-bg);
  color: var(--ag-warn);
  font-size: var(--ag-text-xs);
}

.preset-row__meta {
  color: var(--ag-text-muted);
}

.preset-row__actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 2px;
}

.preset-row__rename {
  flex: 1 1 auto;
}
</style>

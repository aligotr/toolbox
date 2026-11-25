<script setup lang="ts">
// Строка списка пресетов.
//
// Показ и действия строки отделены от диалога: список, создание и откат
// живут в диалоге, а здесь только одна запись со своими кнопками.
// Так диалог остаётся читаемым при том же наборе операций.

import Button from "primevue/button";
import InputText from "primevue/inputtext";
import { t } from "@/core/infra/i18n";
import { PRESET_TITLE_MAX_LENGTH } from "@/core/services/presets/constants";
import type { Preset } from "@/core/services/presets";
import type { PresetDialogTexts } from "./types";

const props = defineProps<{
  preset: Preset;
  isDefault: boolean;
  renaming: boolean;
  renameTitle: string;
  /** Время сохранения в местном виде; готовит диалог. */
  savedAt: string;
  /** Идёт смена пресета по умолчанию. */
  defaultLoading: boolean;
  texts: PresetDialogTexts["row"];
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
  return props.isDefault ? t(props.texts.clearDefault) : t(props.texts.makeDefault);
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
        :aria-label="t(texts.renameAria)"
        @update:model-value="emit('update:renameTitle', $event)"
        @keyup.enter="emit('submit-rename')"
      />
      <Button
        icon="pi pi-check"
        size="small"
        text
        :aria-label="t(texts.renameSave)"
        @click="emit('submit-rename')"
      />
      <Button
        icon="pi pi-times"
        severity="secondary"
        size="small"
        text
        :aria-label="t(texts.renameCancel)"
        @click="emit('cancel-rename')"
      />
    </template>
    <template v-else>
      <button
        type="button"
        class="preset-row__open"
        :aria-label="t(texts.loadAria, { title: preset.title })"
        @click="emit('load', $event)"
      >
        <span class="preset-row__title-row">
          <span class="preset-row__title">{{ preset.title }}</span>
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
          :loading="defaultLoading"
          @click="emit('toggle-default')"
        />
        <Button
          v-tooltip.top="t(texts.loadTip)"
          icon="pi pi-upload"
          severity="secondary"
          size="small"
          text
          :aria-label="t(texts.loadAria, { title: preset.title })"
          @click="emit('load', $event)"
        />
        <Button
          v-tooltip.top="t(texts.renameTip)"
          icon="pi pi-pencil"
          severity="secondary"
          size="small"
          text
          :aria-label="t(texts.renameTipAria)"
          @click="emit('start-rename')"
        />
        <Button
          v-tooltip.top="t(texts.duplicateAria)"
          icon="pi pi-copy"
          severity="secondary"
          size="small"
          text
          :aria-label="t(texts.duplicateAria)"
          @click="emit('duplicate')"
        />
        <Button
          v-tooltip.top="t(texts.deleteTip)"
          icon="pi pi-trash"
          severity="danger"
          size="small"
          text
          :aria-label="t(texts.deleteAria)"
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
  gap: var(--ag-space-xs);
  min-width: 0;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.preset-row__open:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
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

.preset-row__meta {
  color: var(--ag-text-muted);
  font-size: var(--ag-text-xs);
}

.preset-row__actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--ag-space-xs);
}

.preset-row__rename {
  flex: 1 1 auto;
}
</style>

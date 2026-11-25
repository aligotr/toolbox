<script setup lang="ts">
// Диалог пресетов настроек инструмента.
//
// Здесь пресетами управляют: создать с чистых настроек, загрузить,
// переименовать, дублировать, удалить, сохранить текущие настройки
// и отменить правки. Загрузка, создание поверх несохранённых правок
// и удаление спрашивают подтверждение: первое заменяет работу сеанса,
// второе теряет несохранённое, третье защищает от промаха.
//
// Диалог не держит настройки сам: снимок и применение приносит инструмент
// через `source`. Здесь только разметка и короткие обработчики.
//
// Выбор пресета закрывает диалог: замена уже произошла, и второе нажатие
// «Закрыть» было бы лишним. Итог загрузки показывается уведомлением поверх
// экрана, а не строкой над таблицей.

import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import { useConfirm } from "primevue/useconfirm";
import { ref, watch } from "vue";
import { CONFIRM_PRIMARY_ACCEPT } from "@/core/constants";
import { describeError } from "@/core/infra/errors";
import { catalog, t } from "@/core/infra/i18n";
import { notify } from "@/core/infra/notifications";
import { PRESET_TITLE_MAX_LENGTH } from "@/core/services/presets/constants";
import type { Preset, PresetApplyResult } from "@/core/services/presets";
import { requireConfirm } from "@/ui/primevue/popup/confirmPopup";
import { TOOL_DIALOG_MAX_WIDTH, TOOL_DIALOG_WIDTH } from "@/ui/toolLayout";
import ToolPresetCurrent from "./ToolPresetCurrent.vue";
import ToolPresetRow from "./ToolPresetRow.vue";
import type { PresetDialogSource, PresetDialogTexts, PresetRevertOutcome } from "./types";

const props = defineProps<{
  visible: boolean;
  /** Операции сеанса и файлов: их приносит инструмент. */
  source: PresetDialogSource;
  texts: PresetDialogTexts;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  applied: [];
}>();

const confirm = useConfirm();

/** Что произошло последним: результат или причина отказа. */
const note = ref<string | null>(null);

/** Идентификатор пресета, название которого сейчас правят. */
const renamingId = ref<string | null>(null);
const renameTitle = ref("");

/** Название нового пресета. */
const newTitle = ref("");

/** Пресет, который грузится в каждую новую вкладку инструмента. */
function isDefault(preset: Preset): boolean {
  return props.source.presets.state.defaultId === preset.id;
}

/**
 * Назначает пресет по умолчанию или снимает отметку.
 *
 * Настройка действует на новые вкладки: открытый сеанс не трогается, иначе
 * выбор умолчания перезаписал бы текущую работу.
 */
async function toggleDefault(preset: Preset): Promise<void> {
  note.value = null;
  const target = isDefault(preset) ? null : preset.id;
  const done = await props.source.presets.setDefault(target);
  if (!done) {
    note.value = props.source.presets.status.default.error ?? t(props.texts.notes.defaultError);
    return;
  }

  note.value =
    target === null
      ? t(props.texts.notes.defaultCleared)
      : t(props.texts.notes.defaultSet, { title: preset.title });
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    note.value = null;
    renamingId.value = null;
    newTitle.value = "";
    // Список читается заново: файлы профиля могли поправить на другой машине.
    void props.source.presets.load();
  },
);

/** Время сохранения в местном виде: UTC-строка пользователю не читается. */
function savedAtLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t(props.texts.row.unknownSavedAt);
  return date.toLocaleString(catalog.locale, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Загружает пресет, закрывает диалог и показывает итог уведомлением. */
async function loadPreset(preset: Preset): Promise<void> {
  note.value = null;

  // Неожиданный отказ не должен оставлять диалог молчащим: иначе нажатие
  // на пресет выглядит как «ничего не произошло».
  let result: PresetApplyResult;
  try {
    result = await props.source.load(preset);
  } catch (error) {
    note.value = t(props.texts.notes.loadError, {
      title: preset.title,
      reason: describeError(error),
    });
    return;
  }

  if (result.error) {
    note.value = t(result.error.code, result.error.params);
    return;
  }

  const warnings = result.warnings.map((warning) => t(warning.code, warning.params)).join("; ");

  // Группа заменяет прошлое уведомление о пресете: повторная загрузка
  // не должна оставлять на экране два тоста подряд.
  notify(
    result.warnings.length > 0
      ? {
          kind: "warn",
          code: props.texts.notes.loadedWarnings,
          params: { title: preset.title, warnings },
          group: "presets",
        }
      : {
          kind: "success",
          code: props.texts.notes.loaded,
          params: { title: preset.title },
          group: "presets",
        },
  );

  emit("applied");
  emit("update:visible", false);
}

/** Загрузка заменяет работу сеанса: при занятом сеансе сначала спрашиваем. */
function requestLoad(preset: Preset, event: MouseEvent): void {
  if (!props.source.occupied && !props.source.running) {
    void loadPreset(preset);
    return;
  }

  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return;

  requireConfirm(confirm, {
    target,
    message: props.source.running
      ? t(props.texts.confirm.replaceRunningMessage, { title: preset.title })
      : t(props.texts.confirm.replaceMessage, { title: preset.title }),
    acceptLabel: t(props.texts.confirm.loadAccept),
    rejectLabel: t(props.texts.confirm.cancel),
    acceptProps: CONFIRM_PRIMARY_ACCEPT,
    accept: () => {
      void loadPreset(preset);
    },
  });
}

/** Сохраняет текущие настройки в открытый пресет. */
async function saveCurrent(): Promise<void> {
  note.value = null;
  const saved = await props.source.save();
  note.value = saved
    ? t(props.texts.notes.saved, { title: saved.title })
    : (props.source.presets.status.update.error ?? t(props.texts.notes.notSaved));
}

/**
 * Отменяет правки и возвращает настройки открытого пресета.
 *
 * Файл не трогается: источник - снимок, снятый при загрузке или сохранении.
 */
async function revertChanges(): Promise<void> {
  note.value = null;

  // Неожиданный отказ не должен оставлять диалог молчащим.
  let result: PresetRevertOutcome;
  try {
    result = await props.source.revert();
  } catch (error) {
    note.value = t(props.texts.notes.revertFailed, {
      reason: describeError(error),
    });
    return;
  }

  if (result.error) {
    note.value = result.error;
    return;
  }

  note.value = result.message;
  emit("applied");
}

/**
 * Создаёт пресет с чистых настроек: привязка снимается, сеанс возвращается
 * к умолчаниям, диалог закрывается.
 */
async function startNew(): Promise<void> {
  note.value = null;

  try {
    await props.source.startNew();
  } catch (error) {
    note.value = t(props.texts.notes.startNewFailed, { reason: describeError(error) });
    return;
  }

  emit("applied");
  emit("update:visible", false);
}

/** Несохранённая работа: правки открытого пресета или ввод без привязки. */
function hasUnsavedWork(): boolean {
  return props.source.bound ? props.source.changed : props.source.occupied;
}

/** Очистка теряет несохранённое: тогда сначала спрашиваем. */
function requestStartNew(event: MouseEvent): void {
  if (!hasUnsavedWork()) {
    void startNew();
    return;
  }

  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return;

  requireConfirm(confirm, {
    target,
    message: t(props.texts.confirm.startNewMessage),
    acceptLabel: t(props.texts.confirm.startNewAccept),
    rejectLabel: t(props.texts.confirm.cancel),
    acceptProps: CONFIRM_PRIMARY_ACCEPT,
    accept: () => {
      void startNew();
    },
  });
}

/** Создаёт новый пресет из текущих настроек. */
async function createNew(): Promise<void> {
  const title = newTitle.value.trim();
  if (title === "") return;

  note.value = null;
  const created = await props.source.create(title);
  if (!created) {
    note.value = props.source.presets.status.create.error ?? t(props.texts.notes.notCreated);
    return;
  }

  newTitle.value = "";
  note.value = t(props.texts.notes.saved, { title: created.title });
}

function startRename(preset: Preset): void {
  renamingId.value = preset.id;
  renameTitle.value = preset.title;
}

/** Переименование меняет только название: файл остаётся на месте. */
async function submitRename(preset: Preset): Promise<void> {
  const title = renameTitle.value.trim();
  if (title === "" || title === preset.title) {
    renamingId.value = null;
    return;
  }

  note.value = null;
  const renamed = await props.source.presets.rename(preset.id, title);
  if (!renamed) {
    note.value = props.source.presets.status.rename.error ?? t(props.texts.notes.notRenamed);
    return;
  }

  props.source.adoptTitle(renamed);
  renamingId.value = null;
  note.value = t(props.texts.notes.renamed, { title: renamed.title });
}

async function duplicate(preset: Preset): Promise<void> {
  note.value = null;
  const copy = await props.source.presets.duplicate(preset.id);
  note.value = copy
    ? t(props.texts.notes.copied, { title: copy.title })
    : (props.source.presets.status.duplicate.error ?? t(props.texts.notes.notCopied));
}

/** Удаление необратимо в интерфейсе: подтверждение защищает от промаха. */
function requestDelete(preset: Preset, event: MouseEvent): void {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return;

  requireConfirm(confirm, {
    target,
    message: t(props.texts.confirm.deleteMessage, { title: preset.title }),
    acceptLabel: t(props.texts.confirm.deleteAccept),
    rejectLabel: t(props.texts.confirm.cancel),
    accept: () => {
      void remove(preset);
    },
  });
}

async function remove(preset: Preset): Promise<void> {
  note.value = null;
  const removed = await props.source.presets.remove(preset);
  if (!removed) {
    note.value = props.source.presets.status.delete.error ?? t(props.texts.notes.notRemoved);
    return;
  }

  props.source.releaseDeleted(preset.id);
  note.value = t(props.texts.notes.removed, { title: preset.title });
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="t(texts.dialogTitle)"
    modal
    dismissable-mask
    :draggable="false"
    :style="{ width: TOOL_DIALOG_WIDTH, maxWidth: TOOL_DIALOG_MAX_WIDTH }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="presets" autofocus tabindex="-1">
      <ToolPresetCurrent
        :bound="source.bound"
        :title="source.presetTitle"
        :changed="source.changed"
        :loading="source.presets.status.update.loading"
        :texts="texts.current"
        @revert="revertChanges"
        @save="saveCurrent"
      />

      <p v-if="source.presets.status.list.loading" class="presets__note">
        {{ t(texts.list.loading) }}
      </p>
      <p
        v-else-if="source.presets.state.loaded && source.presets.state.items.length === 0"
        class="presets__note"
      >
        {{ t(texts.list.empty) }}
      </p>
      <ul v-else-if="source.presets.state.items.length > 0" class="presets__list">
        <ToolPresetRow
          v-for="preset in source.presets.state.items"
          :key="preset.id"
          :preset="preset"
          :is-default="isDefault(preset)"
          :renaming="renamingId === preset.id"
          v-model:rename-title="renameTitle"
          :saved-at="savedAtLabel(preset.savedAt)"
          :default-loading="source.presets.status.default.loading"
          :texts="texts.row"
          @load="requestLoad(preset, $event)"
          @toggle-default="toggleDefault(preset)"
          @start-rename="startRename(preset)"
          @submit-rename="submitRename(preset)"
          @cancel-rename="renamingId = null"
          @duplicate="duplicate(preset)"
          @delete="requestDelete(preset, $event)"
        />
      </ul>

      <p v-if="source.presets.status.list.error" class="presets__error" role="alert">
        <i class="pi pi-exclamation-circle" aria-hidden="true" />
        {{ source.presets.status.list.error }}
      </p>
      <p v-if="note" class="presets__note" aria-live="polite">{{ note }}</p>

      <form class="presets__create" @submit.prevent="createNew">
        <InputText
          v-model="newTitle"
          class="presets__create-input"
          size="small"
          :maxlength="PRESET_TITLE_MAX_LENGTH"
          :placeholder="t(texts.create.newTitle)"
          :aria-label="t(texts.create.newTitle)"
        />
        <Button
          type="submit"
          :label="t(texts.create.saveAs)"
          icon="pi pi-plus"
          severity="secondary"
          outlined
          size="small"
          :loading="source.presets.status.create.loading"
          :disabled="newTitle.trim() === ''"
        />
      </form>
    </div>

    <template #footer>
      <div class="presets__footer">
        <Button
          class="presets__footer-new"
          :label="t(texts.create.startNew)"
          icon="pi pi-file-plus"
          severity="secondary"
          text
          @click="requestStartNew"
        />
        <Button :label="t(texts.close)" text @click="emit('update:visible', false)" />
      </div>
    </template>
  </Dialog>
</template>

<style scoped src="./presets-dialog.css"></style>

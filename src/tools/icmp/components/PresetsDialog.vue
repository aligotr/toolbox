<script setup lang="ts">
// Диалог пресетов настроек Ping.
//
// Здесь пресетами управляют: загрузить, переименовать, дублировать, удалить,
// сохранить текущие настройки и отменить правки. Загрузка и удаление
// спрашивают подтверждение: первое заменяет список целей, второе защищает
// от промаха.
//
// Диалог не держит настройки сам: снимок и применение живут в `presets/`.
// Здесь только разметка и короткие обработчики.

import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import { useConfirm } from "primevue/useconfirm";
import { computed, ref, watch } from "vue";
import { CONFIRM_PRIMARY_ACCEPT } from "@/core/constants";
import { describeError } from "@/core/infra/errors";
import { catalog, t } from "@/core/infra/i18n";
import { PRESET_TITLE_MAX_LENGTH } from "@/core/services/presets/constants";
import type { Preset } from "@/core/services/presets";
import { requireConfirm } from "@/ui/primevue/popup/confirmPopup";
import { TOOL_DIALOG_MAX_WIDTH, TOOL_DIALOG_WIDTH } from "@/ui/toolLayout";
import {
  adoptPresetTitle,
  applyPreset,
  createPresetFromSession,
  icmpPresetChanged,
  icmpPresets,
  releaseDeletedPreset,
  revertPresetChanges,
  savePresetToCurrent,
  type PresetApplyResult,
  type PresetRevertResult,
} from "../presets";
import type { IcmpSession } from "../types";
import PresetCurrent from "./PresetCurrent.vue";
import PresetRow from "./PresetRow.vue";

const props = defineProps<{
  visible: boolean;
  session: IcmpSession;
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

const changed = computed(() => icmpPresetChanged(props.session));
const bound = computed(() => props.session.presetId !== null);

/** Пресет, который грузится в каждую новую вкладку инструмента. */
function isDefault(preset: Preset): boolean {
  return icmpPresets.state.defaultId === preset.id;
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
  const done = await icmpPresets.setDefault(target);
  if (!done) {
    note.value = icmpPresets.status.default.error ?? t("icmp.preset.defaultError");
    return;
  }

  note.value =
    target === null
      ? t("icmp.preset.defaultCleared")
      : t("icmp.preset.defaultSet", { title: preset.title });
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    note.value = null;
    renamingId.value = null;
    newTitle.value = "";
    // Список читается заново: файлы профиля могли поправить на другой машине.
    void icmpPresets.load();
  },
);

/** Время сохранения в местном виде: UTC-строка пользователю не читается. */
function savedAtLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("icmp.preset.unknownSavedAt");
  return date.toLocaleString(catalog.locale, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Загружает пресет и сообщает об этом родителю. */
async function loadPreset(preset: Preset): Promise<void> {
  note.value = null;

  // Неожиданный отказ не должен оставлять диалог молчащим: иначе нажатие
  // на пресет выглядит как «ничего не произошло».
  let result: PresetApplyResult;
  try {
    result = await applyPreset(props.session, preset);
  } catch (error) {
    note.value = t("icmp.preset.loadError", {
      title: preset.title,
      reason: describeError(error),
    });
    return;
  }

  if (result.error) {
    note.value = t(result.error.code, result.error.params);
    return;
  }

  note.value =
    result.warnings.length > 0
      ? t("icmp.preset.loadedWarnings", {
          title: preset.title,
          warnings: result.warnings.map((warning) => t(warning.code, warning.params)).join("; "),
        })
      : t("icmp.preset.loaded", { title: preset.title });
  emit("applied");
}

/** Загрузка заменяет таблицу: при непустых целях сначала спрашиваем. */
function requestLoad(preset: Preset, event: MouseEvent): void {
  const clean = props.session.targets.length === 0;
  if (clean && !props.session.status.run.loading) {
    void loadPreset(preset);
    return;
  }

  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return;

  requireConfirm(confirm, {
    target,
    message: props.session.status.run.loading
      ? t("icmp.preset.replaceRunningMessage", { title: preset.title })
      : t("icmp.preset.replaceMessage", { title: preset.title }),
    acceptLabel: t("icmp.preset.loadAccept"),
    rejectLabel: t("icmp.preset.cancel"),
    acceptProps: CONFIRM_PRIMARY_ACCEPT,
    accept: () => {
      void loadPreset(preset);
    },
  });
}

/** Сохраняет текущие настройки в открытый пресет. */
async function saveCurrent(): Promise<void> {
  note.value = null;
  const saved = await savePresetToCurrent(props.session);
  note.value = saved
    ? t("icmp.preset.saved", { title: saved.title })
    : (icmpPresets.status.update.error ?? t("icmp.preset.notSaved"));
}

/**
 * Отменяет правки и возвращает настройки открытого пресета.
 *
 * Файл не трогается: источник - снимок, снятый при загрузке или сохранении.
 */
async function revertChanges(): Promise<void> {
  note.value = null;

  // Неожиданный отказ не должен оставлять диалог молчащим.
  let result: PresetRevertResult;
  try {
    result = await revertPresetChanges(props.session);
  } catch (error) {
    note.value = t("icmp.preset.revertFailed", {
      reason: describeError(error),
    });
    return;
  }

  if (result.error) {
    note.value = result.error;
    return;
  }

  note.value = result.cleared ? t("icmp.preset.revertedCleared") : t("icmp.preset.reverted");
  emit("applied");
}

/** Создаёт новый пресет из текущих настроек. */
async function createNew(): Promise<void> {
  const title = newTitle.value.trim();
  if (title === "") return;

  note.value = null;
  const created = await createPresetFromSession(props.session, title);
  if (!created) {
    note.value = icmpPresets.status.create.error ?? t("icmp.preset.notCreated");
    return;
  }

  newTitle.value = "";
  note.value = t("icmp.preset.created", { title: created.title });
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
  const renamed = await icmpPresets.rename(preset.id, title);
  if (!renamed) {
    note.value = icmpPresets.status.rename.error ?? t("icmp.preset.notRenamed");
    return;
  }

  adoptPresetTitle(props.session, renamed);
  renamingId.value = null;
  note.value = t("icmp.preset.renamed", { title: renamed.title });
}

async function duplicate(preset: Preset): Promise<void> {
  note.value = null;
  const copy = await icmpPresets.duplicate(preset.id);
  note.value = copy
    ? t("icmp.preset.copied", { title: copy.title })
    : (icmpPresets.status.duplicate.error ?? t("icmp.preset.notCopied"));
}

/** Удаление необратимо в интерфейсе: подтверждение защищает от промаха. */
function requestDelete(preset: Preset, event: MouseEvent): void {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return;

  requireConfirm(confirm, {
    target,
    message: t("icmp.preset.deleteMessage", { title: preset.title }),
    acceptLabel: t("icmp.preset.deleteAccept"),
    rejectLabel: t("icmp.preset.cancel"),
    accept: () => {
      void remove(preset);
    },
  });
}

async function remove(preset: Preset): Promise<void> {
  note.value = null;
  const removed = await icmpPresets.remove(preset);
  if (!removed) {
    note.value = icmpPresets.status.delete.error ?? t("icmp.preset.notRemoved");
    return;
  }

  releaseDeletedPreset(props.session, preset.id);
  note.value = t("icmp.preset.removed", { title: preset.title });
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="t('icmp.preset.dialogTitle')"
    modal
    dismissable-mask
    :draggable="false"
    :style="{ width: TOOL_DIALOG_WIDTH, maxWidth: TOOL_DIALOG_MAX_WIDTH }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="presets" autofocus tabindex="-1">
      <PresetCurrent
        :bound="bound"
        :title="session.presetTitle"
        :changed="changed"
        :loading="icmpPresets.status.update.loading"
        @revert="revertChanges"
        @save="saveCurrent"
      />

      <p v-if="icmpPresets.status.list.loading" class="presets__note">
        {{ t("icmp.preset.listLoading") }}
      </p>
      <p
        v-else-if="icmpPresets.state.loaded && icmpPresets.state.items.length === 0"
        class="presets__note"
      >
        {{ t("icmp.preset.listEmpty") }}
      </p>
      <ul v-else-if="icmpPresets.state.items.length > 0" class="presets__list">
        <PresetRow
          v-for="preset in icmpPresets.state.items"
          :key="preset.id"
          :preset="preset"
          :is-default="isDefault(preset)"
          :renaming="renamingId === preset.id"
          v-model:rename-title="renameTitle"
          :saved-at="savedAtLabel(preset.savedAt)"
          :loading="icmpPresets.status.default.loading"
          @load="requestLoad(preset, $event)"
          @toggle-default="toggleDefault(preset)"
          @start-rename="startRename(preset)"
          @submit-rename="submitRename(preset)"
          @cancel-rename="renamingId = null"
          @duplicate="duplicate(preset)"
          @delete="requestDelete(preset, $event)"
        />
      </ul>

      <p v-if="icmpPresets.status.list.error" class="presets__error" role="alert">
        <i class="pi pi-exclamation-circle" aria-hidden="true" />
        {{ icmpPresets.status.list.error }}
      </p>
      <p v-if="note" class="presets__note" aria-live="polite">{{ note }}</p>

      <form class="presets__create" @submit.prevent="createNew">
        <InputText
          v-model="newTitle"
          class="presets__create-input"
          size="small"
          :maxlength="PRESET_TITLE_MAX_LENGTH"
          :placeholder="t('icmp.preset.newTitle')"
          :aria-label="t('icmp.preset.newTitle')"
        />
        <Button
          type="submit"
          :label="t('icmp.preset.saveAs')"
          icon="pi pi-plus"
          severity="secondary"
          outlined
          size="small"
          :loading="icmpPresets.status.create.loading"
          :disabled="newTitle.trim() === ''"
        />
      </form>
    </div>

    <template #footer>
      <Button :label="t('icmp.preset.close')" text @click="emit('update:visible', false)" />
    </template>
  </Dialog>
</template>

<style scoped src="./presets-dialog.css"></style>

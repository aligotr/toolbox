<script setup lang="ts">
// Диалог пресетов настроек DNS.
//
// Здесь пресетами управляют: загрузить, переименовать, дублировать, удалить,
// сохранить текущие настройки и отменить правки. Загрузка и удаление
// спрашивают подтверждение: первое заменяет таблицу, второе уносит файл
// в корзину.
//
// Диалог не держит настройки сам: снимок и применение живут в `presets/`.
// Здесь только разметка и короткие обработчики, как и в остальных диалогах
// инструмента.

import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import { useConfirm } from "primevue/useconfirm";
import { computed, ref, watch } from "vue";
import { CONFIRM_CALM_REJECT, CONFIRM_DANGER_ACCEPT } from "@/core/constants";
import { describeError } from "@/core/infra/errors";
import { catalog, t } from "@/core/infra/i18n";
import { PRESET_TITLE_MAX_LENGTH } from "@/core/services/presets/constants";
import type { Preset } from "@/core/services/presets";
import { DIALOG_MAX_WIDTH, DIALOG_WIDTH } from "../constants";
import {
  adoptPresetTitle,
  applyPreset,
  createPresetFromSession,
  dnsPresetChanged,
  dnsPresets,
  releaseDeletedPreset,
  revertPresetChanges,
  savePresetToCurrent,
  type PresetApplyResult,
  type PresetRevertResult,
} from "../presets";
import type { DnsSession } from "../types";

const props = defineProps<{
  visible: boolean;
  session: DnsSession;
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

const changed = computed(() => dnsPresetChanged(props.session));

const bound = computed(() => props.session.presetId !== null);

/** Пресет, который грузится в каждую новую вкладку инструмента. */
function isDefault(preset: Preset): boolean {
  return dnsPresets.state.defaultId === preset.id;
}

/** Действие со звёздочкой: подпись зависит от текущей отметки. */
function defaultActionLabel(preset: Preset): string {
  return isDefault(preset) ? t("dnslookup.preset.clearDefault") : t("dnslookup.preset.makeDefault");
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
  const done = await dnsPresets.setDefault(target);
  if (!done) {
    note.value = dnsPresets.status.default.error ?? t("dnslookup.preset.defaultError");
    return;
  }

  note.value =
    target === null
      ? t("dnslookup.preset.defaultCleared")
      : t("dnslookup.preset.defaultSet", { title: preset.title });
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    note.value = null;
    renamingId.value = null;
    newTitle.value = "";
    // Список читается заново: файлы профиля могли поправить на другой машине.
    void dnsPresets.load();
  },
);

/** Время сохранения в местном виде: UTC-строка пользователю не читается. */
function savedAtLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("dnslookup.preset.unknownSavedAt");
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
    note.value = t("dnslookup.preset.loadError", {
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
      ? t("dnslookup.preset.loadedWarnings", {
          title: preset.title,
          warnings: result.warnings.map((warning) => t(warning.code, warning.params)).join("; "),
        })
      : t("dnslookup.preset.loaded", { title: preset.title });
  emit("applied");
}

/** Загрузка заменяет таблицу: без пустой таблицы сначала спрашиваем. */
function requestLoad(preset: Preset): void {
  const clean = props.session.rows.length === 0;
  if (clean && !props.session.status.run.loading) {
    void loadPreset(preset);
    return;
  }

  const parts = [t("dnslookup.preset.replaceMessage", { title: preset.title })];
  if (props.session.status.run.loading) {
    parts.push(t("dnslookup.preset.replaceRunning"));
  }

  confirm.require({
    header: t("dnslookup.preset.loadHeader"),
    message: parts.join(" "),
    icon: "pi pi-exclamation-triangle",
    acceptLabel: t("dnslookup.preset.loadAccept"),
    rejectLabel: t("dnslookup.preset.cancel"),
    rejectProps: CONFIRM_CALM_REJECT,
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
    ? t("dnslookup.preset.saved", { title: saved.title })
    : (dnsPresets.status.update.error ?? t("dnslookup.preset.notSaved"));
}

/**
 * Отменяет правки и возвращает настройки открытого пресета.
 *
 * Файл не трогается: источник — снимок, снятый при загрузке или сохранении.
 */
async function revertChanges(): Promise<void> {
  note.value = null;

  // Неожиданный отказ не должен оставлять диалог молчащим.
  let result: PresetRevertResult;
  try {
    result = await revertPresetChanges(props.session);
  } catch (error) {
    note.value = t("dnslookup.preset.revertFailed", {
      reason: describeError(error),
    });
    return;
  }

  if (result.error) {
    note.value = result.error;
    return;
  }

  note.value = result.restarted
    ? t("dnslookup.preset.revertedRestarted")
    : t("dnslookup.preset.reverted");
  emit("applied");
}

/** Создаёт новый пресет из текущих настроек. */
async function createNew(): Promise<void> {
  const title = newTitle.value.trim();
  if (title === "") return;

  note.value = null;
  const created = await createPresetFromSession(props.session, title);
  if (!created) {
    note.value = dnsPresets.status.create.error ?? t("dnslookup.preset.notCreated");
    return;
  }

  newTitle.value = "";
  note.value = t("dnslookup.preset.created", { title: created.title });
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
  const renamed = await dnsPresets.rename(preset.id, title);
  if (!renamed) {
    note.value = dnsPresets.status.rename.error ?? t("dnslookup.preset.notRenamed");
    return;
  }

  adoptPresetTitle(props.session, renamed);
  renamingId.value = null;
  note.value = t("dnslookup.preset.renamed", { title: renamed.title });
}

async function duplicate(preset: Preset): Promise<void> {
  note.value = null;
  const copy = await dnsPresets.duplicate(preset.id);
  note.value = copy
    ? t("dnslookup.preset.copied", { title: copy.title })
    : (dnsPresets.status.duplicate.error ?? t("dnslookup.preset.notCopied"));
}

/** Удаление уносит файл в корзину: промах в списке не должен стоить настроек. */
function requestDelete(preset: Preset): void {
  const open = preset.id === props.session.presetId;
  confirm.require({
    header: t("dnslookup.preset.deleteHeader"),
    message: open
      ? t("dnslookup.preset.deleteOpenMessage", { title: preset.title })
      : t("dnslookup.preset.deleteMessage", { title: preset.title }),
    icon: "pi pi-exclamation-triangle",
    acceptLabel: t("dnslookup.preset.deleteAccept"),
    rejectLabel: t("dnslookup.preset.cancel"),
    acceptProps: CONFIRM_DANGER_ACCEPT,
    rejectProps: CONFIRM_CALM_REJECT,
    accept: () => {
      void remove(preset);
    },
  });
}

async function remove(preset: Preset): Promise<void> {
  note.value = null;
  const removed = await dnsPresets.remove(preset);
  if (!removed) {
    note.value = dnsPresets.status.delete.error ?? t("dnslookup.preset.notRemoved");
    return;
  }

  releaseDeletedPreset(props.session, preset.id);
  note.value = t("dnslookup.preset.removed", { title: preset.title });
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="t('dnslookup.preset.dialogTitle')"
    modal
    dismissable-mask
    :draggable="false"
    :style="{ width: DIALOG_WIDTH, maxWidth: DIALOG_MAX_WIDTH }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="presets">
      <section class="presets__current">
        <div class="presets__current-text">
          <template v-if="bound">
            <span class="presets__current-title">{{ session.presetTitle }}</span>
            <small v-if="changed" class="presets__current-state presets__current-state--changed">
              {{ t("dnslookup.preset.currentChanged") }}
            </small>
          </template>
          <template v-else>
            <span class="presets__current-title">{{ t("dnslookup.preset.none") }}</span>
            <small class="presets__current-state">
              {{ t("dnslookup.preset.noneHint") }}
            </small>
          </template>
        </div>
        <div v-if="bound" class="presets__current-actions">
          <Button
            v-tooltip.top="t('dnslookup.preset.revertHint')"
            icon="pi pi-undo"
            severity="secondary"
            text
            size="small"
            :aria-label="t('dnslookup.preset.revertHint')"
            :disabled="!changed"
            @click="revertChanges"
          />
          <Button
            :label="t('dnslookup.preset.saveChanges')"
            icon="pi pi-save"
            size="small"
            :loading="dnsPresets.status.update.loading"
            :disabled="!changed"
            @click="saveCurrent"
          />
        </div>
      </section>

      <p v-if="dnsPresets.status.list.loading" class="presets__note">
        {{ t("dnslookup.preset.listLoading") }}
      </p>
      <p
        v-else-if="dnsPresets.state.loaded && dnsPresets.state.items.length === 0"
        class="presets__note"
      >
        {{ t("dnslookup.preset.listEmpty") }}
      </p>
      <ul v-else-if="dnsPresets.state.items.length > 0" class="presets__list">
        <li v-for="preset in dnsPresets.state.items" :key="preset.id" class="presets__item">
          <template v-if="renamingId === preset.id">
            <InputText
              v-model="renameTitle"
              class="presets__rename"
              size="small"
              :maxlength="PRESET_TITLE_MAX_LENGTH"
              :aria-label="t('dnslookup.preset.renameAria')"
              @keyup.enter="submitRename(preset)"
            />
            <Button
              icon="pi pi-check"
              size="small"
              text
              :aria-label="t('dnslookup.preset.renameSave')"
              :loading="dnsPresets.status.rename.loading"
              @click="submitRename(preset)"
            />
            <Button
              icon="pi pi-times"
              severity="secondary"
              size="small"
              text
              :aria-label="t('dnslookup.preset.renameCancel')"
              @click="renamingId = null"
            />
          </template>
          <template v-else>
            <button
              type="button"
              class="presets__open"
              :aria-label="t('dnslookup.preset.loadAria', { title: preset.title })"
              @click="requestLoad(preset)"
            >
              <span class="presets__title-row">
                <span class="presets__title">{{ preset.title }}</span>
                <span v-if="isDefault(preset)" class="presets__default">
                  {{ t("dnslookup.preset.badgeDefault") }}
                </span>
              </span>
              <small class="presets__meta">
                {{ savedAtLabel(preset.savedAt) }}
              </small>
            </button>
            <div class="presets__actions">
              <Button
                v-tooltip.top="defaultActionLabel(preset)"
                :icon="isDefault(preset) ? 'pi pi-star-fill' : 'pi pi-star'"
                :severity="isDefault(preset) ? 'warn' : 'secondary'"
                size="small"
                text
                :aria-label="defaultActionLabel(preset)"
                :loading="dnsPresets.status.default.loading"
                @click="toggleDefault(preset)"
              />
              <Button
                v-tooltip.top="t('dnslookup.preset.loadTip')"
                icon="pi pi-upload"
                severity="secondary"
                size="small"
                text
                :aria-label="t('dnslookup.preset.loadTipAria')"
                @click="requestLoad(preset)"
              />
              <Button
                v-tooltip.top="t('dnslookup.preset.renameTip')"
                icon="pi pi-pencil"
                severity="secondary"
                size="small"
                text
                :aria-label="t('dnslookup.preset.renameTipAria')"
                @click="startRename(preset)"
              />
              <Button
                v-tooltip.top="t('dnslookup.preset.duplicateTip')"
                icon="pi pi-copy"
                severity="secondary"
                size="small"
                text
                :aria-label="t('dnslookup.preset.duplicateAria')"
                :loading="dnsPresets.status.duplicate.loading"
                @click="duplicate(preset)"
              />
              <Button
                v-tooltip.top="t('dnslookup.preset.deleteTip')"
                icon="pi pi-trash"
                severity="danger"
                size="small"
                text
                :aria-label="t('dnslookup.preset.deleteAria')"
                @click="requestDelete(preset)"
              />
            </div>
          </template>
        </li>
      </ul>

      <p v-if="dnsPresets.status.list.error" class="presets__error" role="alert">
        <i class="pi pi-exclamation-circle" aria-hidden="true" />
        {{ dnsPresets.status.list.error }}
      </p>
      <p v-if="note" class="presets__note" aria-live="polite">{{ note }}</p>

      <form class="presets__create" @submit.prevent="createNew">
        <InputText
          v-model="newTitle"
          class="presets__create-input"
          size="small"
          :maxlength="PRESET_TITLE_MAX_LENGTH"
          :placeholder="t('dnslookup.preset.newTitle')"
          :aria-label="t('dnslookup.preset.newTitle')"
        />
        <Button
          type="submit"
          :label="t('dnslookup.preset.saveAs')"
          icon="pi pi-plus"
          severity="secondary"
          outlined
          size="small"
          :loading="dnsPresets.status.create.loading"
          :disabled="newTitle.trim() === ''"
        />
      </form>
    </div>

    <template #footer>
      <Button :label="t('dnslookup.preset.close')" text @click="emit('update:visible', false)" />
    </template>
  </Dialog>
</template>

<style scoped>
.presets {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-xl);
}

.presets__current {
  display: flex;
  align-items: center;
  gap: var(--ag-space-md);
  padding: var(--ag-space-sm) var(--ag-space-lg);
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-sm);
}

.presets__current-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--ag-space-xs);
  min-width: 0;
}

.presets__current-actions {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ag-space-xs);
}

.presets__current-title {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.presets__current-state {
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.presets__current-state--changed {
  color: var(--ag-warn);
}

.presets__list {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}

.presets__item {
  display: flex;
  align-items: center;
  gap: var(--ag-space-sm);
  padding: var(--ag-space-sm);
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-sm);
}

.presets__open {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--ag-space-xs);
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.presets__open:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.presets__title-row {
  display: flex;
  align-items: center;
  gap: var(--ag-space-sm);
  min-width: 0;
}

.presets__title {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.presets__default {
  flex: none;
  padding: 0 var(--ag-space-xs);
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-sm);
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.presets__meta {
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.presets__actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--ag-space-xs);
}

.presets__rename,
.presets__create-input {
  flex: 1;
  min-width: 0;
}

.presets__note,
.presets__error {
  display: flex;
  align-items: flex-start;
  gap: var(--ag-space-sm);
  margin: 0;
  font-size: var(--ag-text-sm);
}

.presets__note {
  color: var(--p-text-muted-color);
}

.presets__error {
  color: var(--ag-danger);
}

.presets__create {
  display: flex;
  gap: var(--ag-space-sm);
}
</style>

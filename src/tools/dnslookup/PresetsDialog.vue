<script setup lang="ts">
// Диалог пресетов настроек DNS.
//
// Здесь пресетами управляют: загрузить, переименовать, дублировать, удалить,
// сохранить текущие настройки и отменить правки. Загрузка и удаление
// спрашивают подтверждение: первое заменяет таблицу, второе уносит файл
// в корзину.
//
// Диалог не держит настройки сам: снимок и применение живут в `presets.ts`.
// Здесь только разметка и короткие обработчики, как и в остальных диалогах
// инструмента.

import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import { useConfirm } from "primevue/useconfirm";
import { computed, ref, watch } from "vue";
import type { Preset } from "../../contracts/presets";
import { PRESET_TITLE_MAX_LENGTH } from "../../core/constants";
import { describeError } from "../../core/errors";
import {
  DATE_LOCALE,
  DIALOG_MAX_WIDTH,
  DIALOG_WIDTH,
  UNKNOWN_SAVED_AT,
} from "./constants";
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
} from "./presets";
import type { DnsSession } from "./types";

const props = defineProps<{
  visible: boolean;
  session: DnsSession;
  /** Открыт для создания пресета: курсор сразу в поле названия. */
  focusCreate?: boolean;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  "update:focusCreate": [value: boolean];
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
  if (Number.isNaN(date.getTime())) return UNKNOWN_SAVED_AT;
  return date.toLocaleString(DATE_LOCALE, {
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
    note.value = `Пресет «${preset.title}» не загружен: ${describeError(error)}`;
    return;
  }

  if (result.error) {
    note.value = result.error;
    return;
  }

  note.value =
    result.warnings.length > 0
      ? `Загружен пресет «${preset.title}». ${result.warnings.join("; ")}.`
      : `Загружен пресет «${preset.title}».`;
  emit("applied");
}

/** Загрузка заменяет таблицу: без пустой таблицы сначала спрашиваем. */
function requestLoad(preset: Preset): void {
  const clean = props.session.rows.length === 0;
  if (clean && !props.session.status.run.loading) {
    void loadPreset(preset);
    return;
  }

  const parts = [
    `Текущие строки и результаты будут заменены пресетом «${preset.title}».`,
  ];
  if (props.session.status.run.loading) {
    parts.push("Идущая проверка будет остановлена.");
  }

  confirm.require({
    header: "Загрузить пресет",
    message: parts.join(" "),
    icon: "pi pi-exclamation-triangle",
    acceptLabel: "Загрузить",
    rejectLabel: "Отмена",
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
    ? `Пресет «${saved.title}» сохранён.`
    : (dnsPresets.status.update.error ?? "Пресет не сохранён.");
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
    note.value = `Изменения не отменены: ${describeError(error)}`;
    return;
  }

  if (result.error) {
    note.value = result.error;
    return;
  }

  note.value = result.restarted
    ? "Изменения отменены. Таблица запросов изменилась: результаты очищены, проверка запущена заново."
    : "Изменения отменены.";
  emit("applied");
}

/** Создаёт новый пресет из текущих настроек. */
async function createNew(): Promise<void> {
  const title = newTitle.value.trim();
  if (title === "") return;

  note.value = null;
  const created = await createPresetFromSession(props.session, title);
  if (!created) {
    note.value = dnsPresets.status.create.error ?? "Пресет не сохранён.";
    return;
  }

  newTitle.value = "";
  note.value = `Сохранён пресет «${created.title}».`;
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
    note.value = dnsPresets.status.rename.error ?? "Пресет не переименован.";
    return;
  }

  adoptPresetTitle(props.session, renamed);
  renamingId.value = null;
  note.value = `Пресет переименован: «${renamed.title}».`;
}

async function duplicate(preset: Preset): Promise<void> {
  note.value = null;
  const copy = await dnsPresets.duplicate(preset.id);
  note.value = copy
    ? `Создана копия «${copy.title}».`
    : (dnsPresets.status.duplicate.error ?? "Пресет не скопирован.");
}

/** Удаление уносит файл в корзину: промах в списке не должен стоить настроек. */
function requestDelete(preset: Preset): void {
  const open = preset.id === props.session.presetId;
  confirm.require({
    header: "Удалить пресет",
    message: open
      ? `Пресет «${preset.title}» будет перемещён в корзину, привязка снимется. Текущие настройки останутся в таблице.`
      : `Пресет «${preset.title}» будет перемещён в корзину.`,
    icon: "pi pi-exclamation-triangle",
    acceptLabel: "Удалить",
    rejectLabel: "Отмена",
    accept: () => {
      void remove(preset);
    },
  });
}

async function remove(preset: Preset): Promise<void> {
  note.value = null;
  const removed = await dnsPresets.remove(preset);
  if (!removed) {
    note.value = dnsPresets.status.delete.error ?? "Пресет не удалён.";
    return;
  }

  releaseDeletedPreset(props.session, preset.id);
  note.value = `Пресет «${preset.title}» перемещён в корзину.`;
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Пресеты настроек"
    modal
    :draggable="false"
    :style="{ width: DIALOG_WIDTH, maxWidth: DIALOG_MAX_WIDTH }"
    @hide="emit('update:focusCreate', false)"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="presets">
      <section class="presets__current">
        <div class="presets__current-text">
          <template v-if="bound">
            <span class="presets__current-title">{{ session.presetTitle }}</span>
            <small
              v-if="changed"
              class="presets__current-state presets__current-state--changed"
            >
              настройки изменены
            </small>
          </template>
          <template v-else>
            <span class="presets__current-title">Пресет не выбран</span>
            <small class="presets__current-state">
              Сохраните текущие настройки отдельным пресетом.
            </small>
          </template>
        </div>
        <div v-if="bound" class="presets__current-actions">
          <Button
            v-tooltip.top="'Отменить изменения'"
            icon="pi pi-undo"
            severity="secondary"
            text
            rounded
            size="small"
            aria-label="Отменить изменения"
            :disabled="!changed"
            @click="revertChanges"
          />
          <Button
            label="Сохранить"
            icon="pi pi-save"
            size="small"
            :loading="dnsPresets.status.update.loading"
            :disabled="!changed"
            @click="saveCurrent"
          />
        </div>
      </section>

      <p v-if="dnsPresets.status.list.loading" class="presets__note">
        Список пресетов читается…
      </p>
      <p
        v-else-if="dnsPresets.state.loaded && dnsPresets.state.items.length === 0"
        class="presets__note"
      >
        Пресетов пока нет. Настройте инструмент и сохраните настройки первым
        пресетом.
      </p>
      <ul v-else-if="dnsPresets.state.items.length > 0" class="presets__list">
        <li
          v-for="preset in dnsPresets.state.items"
          :key="preset.id"
          class="presets__item"
        >
          <template v-if="renamingId === preset.id">
            <InputText
              v-model="renameTitle"
              class="presets__rename"
              size="small"
              :maxlength="PRESET_TITLE_MAX_LENGTH"
              aria-label="Новое название пресета"
              @keyup.enter="submitRename(preset)"
            />
            <Button
              icon="pi pi-check"
              size="small"
              text
              aria-label="Сохранить название"
              :loading="dnsPresets.status.rename.loading"
              @click="submitRename(preset)"
            />
            <Button
              icon="pi pi-times"
              severity="secondary"
              size="small"
              text
              aria-label="Отменить переименование"
              @click="renamingId = null"
            />
          </template>
          <template v-else>
            <button
              type="button"
              class="presets__open"
              :aria-label="`Загрузить пресет ${preset.title}`"
              @click="requestLoad(preset)"
            >
              <span class="presets__title">{{ preset.title }}</span>
              <small class="presets__meta">
                {{ savedAtLabel(preset.savedAt) }}
              </small>
            </button>
            <div class="presets__actions">
              <Button
                v-tooltip.top="'Загрузить'"
                icon="pi pi-upload"
                severity="secondary"
                size="small"
                text
                aria-label="Загрузить пресет"
                @click="requestLoad(preset)"
              />
              <Button
                v-tooltip.top="'Переименовать'"
                icon="pi pi-pencil"
                severity="secondary"
                size="small"
                text
                aria-label="Переименовать пресет"
                @click="startRename(preset)"
              />
              <Button
                v-tooltip.top="'Дублировать'"
                icon="pi pi-copy"
                severity="secondary"
                size="small"
                text
                aria-label="Дублировать пресет"
                :loading="dnsPresets.status.duplicate.loading"
                @click="duplicate(preset)"
              />
              <Button
                v-tooltip.top="'Удалить'"
                icon="pi pi-trash"
                severity="danger"
                size="small"
                text
                aria-label="Удалить пресет"
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
          :autofocus="focusCreate"
          :maxlength="PRESET_TITLE_MAX_LENGTH"
          placeholder="Название нового пресета"
          aria-label="Название нового пресета"
        />
        <Button
          type="submit"
          label="Сохранить как пресет"
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
      <Button
        label="Закрыть"
        text
        @click="emit('update:visible', false)"
      />
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

.presets__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.presets__rename {
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

.presets__create-input {
  flex: 1;
  min-width: 0;
}
</style>

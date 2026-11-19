<script setup lang="ts">
// Раздел «Профили» в настройках.
//
// Профиль — папка `profiles/<id>/` с названием в `profile.json` (ADR 0010).
// Здесь видны все профили, активный отмечен. Переключение и удаление требуют
// подтверждения: первое перезапускает приложение, второе уносит папку в корзину.

import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Popover from "primevue/popover";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import type { Profile } from "@/contracts/profiles";
import { t } from "@/core/infra/i18n";
import {
  createProfile,
  loadProfiles,
  loadProfilesUsage,
  profiles,
  profileUsageOf,
  renameProfile,
  status,
} from "@/core/services/profiles";
import { filesLabel, presetsLabel } from "../../plural";
import { useProfiles } from "../useProfiles";

const { requestSwitch, requestDelete } = useProfiles();

/** Подпись счётчиков профиля; пусто, пока они не прочитаны. */
function usageLabel(id: string): string {
  const counts = profileUsageOf(id);
  if (!counts) return "";
  return `${presetsLabel(counts.presets)} · ${filesLabel(counts.data_files)}`;
}

/** Создание профиля: панель у кнопки, чтобы список не сдвигался. */
const createMenu = ref<InstanceType<typeof Popover> | null>(null);
const createInput = ref<InstanceType<typeof InputText> | null>(null);
const newTitle = ref("");

/** Профиль, отмеченный радиокнопкой до подтверждения переключения. */
const pendingId = ref<string | null>(null);

/**
 * Выбор профиля радиокнопкой.
 *
 * Отметка ставится сразу, а активным профиль становится после подтверждения
 * и перезапуска. Отказ возвращает отметку на активный профиль.
 */
const selected = computed({
  get: () => pendingId.value ?? profiles.active ?? "",
  set: (id: string) => {
    if (id === profiles.active) return;

    const profile = profiles.items.find((item) => item.id === id);
    if (!profile) return;

    pendingId.value = id;
    requestSwitch(profile, () => {
      pendingId.value = null;
    });
  },
});

/** Клик по карточке выбирает профиль, как радиокнопка. */
function select(profile: Profile): void {
  if (profile.id === profiles.active || renamingId.value === profile.id) return;
  selected.value = profile.id;
}

/** Отказ переключения возвращает отметку на активный профиль. */
watch(
  () => status.switch.error,
  (error) => {
    if (error) pendingId.value = null;
  },
);

/** Смена активного профиля снимает отложенную отметку. */
watch(
  () => profiles.active,
  () => {
    pendingId.value = null;
  },
);

/** Идентификатор профиля, который сейчас переименовывают. */
const renamingId = ref<string | null>(null);

/** Новое название; до отправки живёт в поле. */
const renameTitle = ref("");

/** Предел названия повторяет предел ядра: длиннее всё равно не сохранится. */
const TITLE_MAX_LENGTH = 60;

/** Поле переименования: при появлении получает фокус и выделяет текст. */
function setRenameInput(target: unknown): void {
  const element = (target as { $el?: unknown } | null)?.$el;
  if (!(element instanceof HTMLInputElement)) return;

  // Обновление карточки снова зовёт ref: уже активное поле не трогаем,
  // иначе выделение сбрасывалось бы на каждом введённом символе.
  if (document.activeElement === element) return;

  element.focus();
  element.select();
}

/** Открывает правку на месте и подставляет текущее название. */
function startRename(profile: Profile): void {
  renamingId.value = profile.id;
  renameTitle.value = profile.title;
  status.rename.error = null;
}

/** Закрывает правку, ничего не записывая. */
function cancelRename(): void {
  renamingId.value = null;
  renameTitle.value = "";
  status.rename.error = null;
}

/** Сохранять есть что: название непустое, изменилось и запись не идёт. */
function canSaveRename(profile: Profile): boolean {
  const title = renameTitle.value.trim();
  return title !== "" && title !== profile.title && !status.rename.loading;
}

/** Записывает название; пустое и прежнее не отправляются. */
async function submitRename(profile: Profile): Promise<void> {
  const title = renameTitle.value.trim();
  if (!title) return;

  if (title === profile.title) {
    cancelRename();
    return;
  }

  if (await renameProfile(profile.id, title)) {
    renamingId.value = null;
    renameTitle.value = "";
  }
}

/** Открывает панель создания у кнопки. */
function startCreate(event: MouseEvent): void {
  resetCreate();
  createMenu.value?.toggle(event);
}

/** Закрывает панель, ничего не создавая. */
function cancelCreate(): void {
  createMenu.value?.hide();
  resetCreate();
}

/** Сбрасывает ввод: закрытая панель не хранит прошлую попытку. */
function resetCreate(): void {
  newTitle.value = "";
  status.create.error = null;
}

/** Ставит фокус в поле после показа панели. */
async function focusCreate(): Promise<void> {
  await nextTick();
  const instance = createInput.value as unknown as { $el?: unknown } | null;
  const element = instance?.$el;
  if (element instanceof HTMLInputElement) element.focus();
}

/** Создаёт профиль; успех закрывает панель, ошибка оставляет её открытой. */
async function submitCreate(): Promise<void> {
  const title = newTitle.value.trim();
  if (!title) return;

  if (await createProfile(title)) {
    cancelCreate();
  }
}

onMounted(() => {
  void loadProfiles();
  void loadProfilesUsage();
});
</script>

<template>
  <section class="profiles wb-section">
    <header class="profiles__head">
      <div class="wb-section__head">
        <h2 class="wb-section__title">{{ t("settings.section.profiles") }}</h2>
        <p class="wb-section__lead">{{ t("settings.profiles.lead") }}</p>
      </div>

      <Button
        class="profiles__create"
        :label="t('settings.profiles.create')"
        icon="pi pi-plus"
        size="small"
        severity="secondary"
        outlined
        @click="startCreate"
      />
    </header>

    <Popover ref="createMenu" @show="focusCreate" @hide="resetCreate">
      <form
        class="profiles__create-form"
        @submit.prevent="submitCreate"
        @keydown.esc="cancelCreate"
      >
        <InputText
          ref="createInput"
          v-model="newTitle"
          class="profiles__create-input"
          size="small"
          :maxlength="TITLE_MAX_LENGTH"
          :placeholder="t('settings.profiles.titlePlaceholder')"
          :aria-label="t('settings.profiles.titleAria')"
          :disabled="status.create.loading"
        />
        <div class="profiles__create-actions">
          <Button
            type="submit"
            :label="t('settings.profiles.submit')"
            size="small"
            :loading="status.create.loading"
            :disabled="!newTitle.trim()"
          />
          <Button
            type="button"
            :label="t('settings.profiles.cancel')"
            size="small"
            severity="secondary"
            text
            @click="cancelCreate"
          />
        </div>
      </form>
    </Popover>

    <p v-if="!profiles.loaded" class="profiles__note">
      {{ t("settings.profiles.loading") }}
    </p>
    <p v-else-if="!profiles.items.length" class="profiles__note">
      {{ t("settings.profiles.empty") }}
    </p>

    <ul
      v-else
      class="profiles__list"
      role="radiogroup"
      :aria-label="t('settings.section.profiles')"
    >
      <li
        v-for="profile in profiles.items"
        :key="profile.id"
        class="profile-row"
        :class="{
          'profile-row--active': profile.id === profiles.active,
          'profile-row--renaming': renamingId === profile.id,
          'profile-row--unnamed': !profile.named,
        }"
        @click="select(profile)"
      >
        <input
          class="profile-row__radio"
          type="radio"
          name="active-profile"
          :value="profile.id"
          v-model="selected"
          :disabled="renamingId === profile.id"
          :aria-label="profile.title"
          @click.stop
        />

        <div class="profile-row__main">
          <InputText
            v-if="renamingId === profile.id"
            :ref="setRenameInput"
            v-model="renameTitle"
            class="profile-row__name-input"
            size="small"
            :maxlength="TITLE_MAX_LENGTH"
            :aria-label="t('settings.profiles.renameAria', { title: profile.title })"
            :disabled="status.rename.loading"
            @keyup.enter="submitRename(profile)"
            @keyup.esc="cancelRename"
            @click.stop
          />
          <div v-else class="profile-row__title">
            <strong class="profile-row__name">{{ profile.title }}</strong>
            <span
              v-if="!profile.named"
              class="profile-row__badge profile-row__badge--bad"
              :title="t('settings.profiles.unnamedHint')"
            >
              {{ t("settings.profiles.unnamed") }}
            </span>
          </div>
          <span class="profile-row__meta">
            <template v-if="usageLabel(profile.id)"> {{ usageLabel(profile.id) }} · </template>
            <span class="profile-row__id mono">{{ profile.id }}</span>
          </span>
        </div>

        <div class="profile-row__actions" @click.stop>
          <template v-if="renamingId === profile.id">
            <Button
              v-tooltip.top="t('settings.profiles.renameSave')"
              icon="pi pi-check"
              size="small"
              text
              :aria-label="t('settings.profiles.renameSave')"
              :loading="status.rename.loading"
              :disabled="!canSaveRename(profile)"
              @click="submitRename(profile)"
            />
            <Button
              v-tooltip.top="t('settings.profiles.renameCancel')"
              icon="pi pi-times"
              severity="secondary"
              size="small"
              text
              :aria-label="t('settings.profiles.renameCancel')"
              :disabled="status.rename.loading"
              @click="cancelRename"
            />
          </template>
          <template v-else>
            <Button
              :label="t('settings.profiles.rename')"
              size="small"
              severity="secondary"
              text
              :disabled="status.rename.loading"
              @click="startRename(profile)"
            />
            <Button
              v-if="profile.id !== profiles.active"
              :label="t('settings.profiles.delete')"
              size="small"
              severity="danger"
              text
              :disabled="status.delete.loading"
              @click="requestDelete(profile, $event)"
            />
          </template>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.profiles__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ag-space-lg);
}

/* Заголовок с пояснением занимает свободное место, а кнопка сохраняет
   свою ширину: иначе длинное пояснение сжимает её до узкого столбца. */
.profiles__head .wb-section__head {
  flex: 1 1 auto;
  min-width: 0;
}

.profiles__create {
  flex-shrink: 0;
}

/* Панель создания: поле сверху, кнопки под ним у правого края. */
.profiles__create-form {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-md);
  width: 260px;
}

.profiles__create-input {
  width: 100%;
}

.profiles__create-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ag-space-sm);
}

.profiles__list {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-sm);
  margin: 0;
  padding: 0;
  list-style: none;
  /* Раскладка карточки зависит от её ширины: место занимает навигация. */
  container-type: inline-size;
}

/* Карточка профиля в одном стиле с карточкой языка: выбор слева,
   название и счётчики в теле, действия справа. */
.profile-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-areas: "radio body actions";
  align-items: center;
  gap: var(--ag-space-lg);
  padding: var(--ag-space-lg);
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-md);
  background: var(--ag-surface);
  cursor: pointer;
}

.profile-row:not(.profile-row--active):hover {
  border-color: var(--ag-border-strong);
}

.profile-row--active {
  border-color: var(--p-primary-color);
  background: var(--p-surface-100);
}

/* Профиль без читаемого названия приглушён, но остаётся доступным:
   папка существует, переключение и правка работают. */
.profile-row--unnamed:not(.profile-row--active) {
  border-style: dashed;
}

.profile-row--unnamed:not(.profile-row--renaming) .profile-row__radio,
.profile-row--unnamed:not(.profile-row--renaming) .profile-row__main {
  opacity: 0.7;
}

.profile-row--active,
.profile-row--renaming {
  cursor: default;
}

.profile-row__radio {
  grid-area: radio;
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--p-primary-color);
}

.profile-row__main {
  grid-area: body;
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-xs);
  min-width: 0;
}

.profile-row__title {
  display: flex;
  align-items: center;
  gap: var(--ag-space-sm);
  flex-wrap: wrap;
}

.profile-row__name {
  font-size: var(--ag-text-sm);
  font-weight: 600;
}

.profile-row__badge {
  padding: 2px 6px;
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-sm);
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
  white-space: nowrap;
}

.profile-row__badge--bad {
  border-color: var(--ag-danger);
  color: var(--ag-danger);
}

.profile-row__name-input {
  width: 100%;
  max-width: 360px;
  font-size: var(--ag-text-sm);
  font-weight: 600;
}

.profile-row__id {
  color: var(--p-text-muted-color);
}

.profile-row__meta {
  display: flex;
  align-items: center;
  gap: var(--ag-space-sm);
  flex-wrap: wrap;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.profile-row__actions {
  grid-area: actions;
  display: flex;
  align-items: center;
  gap: var(--ag-space-xs);
  flex-wrap: wrap;
  justify-content: flex-end;
}

.profiles__note {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-sm);
}

.mono {
  font-family: var(--ag-font-mono);
  font-size: var(--ag-text-xs);
}

/* Узкая карточка: действия уходят под текст. Выравнивание остаётся
   естественным, у правого края. */
@container (max-width: 660px) {
  .profile-row {
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-areas:
      "radio body"
      "actions actions";
    align-items: start;
    row-gap: var(--ag-space-md);
  }

  .profile-row__radio {
    margin-top: 2px;
  }
}
</style>

<script setup lang="ts">
// Раздел «Профили» в настройках.
//
// Профиль — папка `profiles/<id>/` с названием в `profile.json` (ADR 0010).
// Здесь видны все профили, активный отмечен. Переключение и удаление требуют
// подтверждения: первое перезапускает приложение, второе уносит папку в корзину.

import Button from "primevue/button";
import InputText from "primevue/inputtext";
import { computed, onMounted, ref, watch } from "vue";
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

/** Создание профиля: форма и поле живут в разделе, у него один потребитель. */
const creating = ref(false);
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

/** Новое название; до отправки живёт в форме. */
const renameTitle = ref("");

/** Открывает форму и подставляет текущее название. */
function startRename(profile: Profile): void {
  renamingId.value = profile.id;
  renameTitle.value = profile.title;
  status.rename.error = null;
}

/** Закрывает форму, ничего не записывая. */
function cancelRename(): void {
  renamingId.value = null;
  renameTitle.value = "";
  status.rename.error = null;
}

/** Записывает название; пустое не отправляется. */
async function submitRename(profile: Profile): Promise<void> {
  const title = renameTitle.value.trim();
  if (!title) return;

  if (await renameProfile(profile.id, title)) {
    renamingId.value = null;
    renameTitle.value = "";
  }
}

function startCreate(): void {
  creating.value = true;
  newTitle.value = "";
  status.create.error = null;
}

function cancelCreate(): void {
  creating.value = false;
  newTitle.value = "";
  status.create.error = null;
}

async function submitCreate(): Promise<void> {
  const title = newTitle.value.trim();
  if (!title) return;

  if (await createProfile(title)) {
    creating.value = false;
    newTitle.value = "";
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
        v-if="!creating"
        class="profiles__create"
        :label="t('settings.profiles.create')"
        icon="pi pi-plus"
        size="small"
        severity="secondary"
        outlined
        @click="startCreate"
      />
    </header>

    <form v-if="creating" class="profiles__form" @submit.prevent="submitCreate">
      <InputText
        v-model="newTitle"
        :placeholder="t('settings.profiles.titlePlaceholder')"
        :aria-label="t('settings.profiles.titleAria')"
      />
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
    </form>
    <p v-if="status.create.error" class="profiles__error">{{ status.create.error }}</p>

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
          <strong class="profile-row__name">{{ profile.title }}</strong>
          <span class="profile-row__meta">
            <template v-if="usageLabel(profile.id)"> {{ usageLabel(profile.id) }} · </template>
            <span class="profile-row__id mono">{{ profile.id }}</span>
          </span>
        </div>

        <form
          v-if="renamingId === profile.id"
          class="profile-row__form"
          @click.stop
          @submit.prevent="submitRename(profile)"
        >
          <InputText
            v-model="renameTitle"
            :aria-label="t('settings.profiles.renameAria', { title: profile.title })"
          />
          <Button
            type="submit"
            :label="t('settings.profiles.save')"
            size="small"
            :loading="status.rename.loading"
            :disabled="!renameTitle.trim()"
          />
          <Button
            type="button"
            :label="t('settings.profiles.cancel')"
            size="small"
            severity="secondary"
            text
            @click="cancelRename"
          />
        </form>

        <div v-else class="profile-row__actions" @click.stop>
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
        </div>

        <p v-if="renamingId === profile.id && status.rename.error" class="profile-row__error">
          {{ status.rename.error }}
        </p>
      </li>
    </ul>

    <p v-if="status.switch.error" class="profiles__error">{{ status.switch.error }}</p>
    <p v-if="status.delete.error" class="profiles__error">{{ status.delete.error }}</p>
    <p v-if="status.usage.error" class="profiles__error">{{ status.usage.error }}</p>
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

.profiles__form,
.profile-row__form {
  display: flex;
  align-items: center;
  gap: var(--ag-space-sm);
  flex-wrap: wrap;
}

.profiles__form :deep(input),
.profile-row__form :deep(input) {
  min-width: 240px;
}

.profile-row__form {
  grid-column: 1 / -1;
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

.profile-row__name {
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

.profile-row__error {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--ag-danger);
  font-size: var(--ag-text-xs);
  line-height: 1.45;
}

.profiles__error {
  margin: 0;
  color: var(--ag-danger);
  font-size: var(--ag-text-xs);
  line-height: 1.45;
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

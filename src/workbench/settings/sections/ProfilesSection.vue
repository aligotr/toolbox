<script setup lang="ts">
// Раздел «Профили» в настройках.
//
// Профиль — папка `profiles/<id>/` с названием в `profile.json` (ADR 0010).
// Здесь видны все профили, активный отмечен. Переключение и удаление требуют
// подтверждения: первое перезапускает приложение, второе уносит папку в корзину.

import Button from "primevue/button";
import InputText from "primevue/inputtext";
import { onMounted, ref } from "vue";
import type { Profile } from "@/contracts/profiles";
import { t } from "@/core/infra/i18n";
import {
  createProfile,
  loadProfiles,
  profiles,
  renameProfile,
  status,
} from "@/core/services/profiles";
import { filesLabel, presetsLabel } from "../../plural";
import { useProfiles } from "../useProfiles";

const { requestSwitch, requestDelete } = useProfiles();

/** Создание профиля: форма и поле живут в разделе, у него один потребитель. */
const creating = ref(false);
const newTitle = ref("");

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

    <ul v-else class="profiles__list">
      <li
        v-for="profile in profiles.items"
        :key="profile.id"
        class="profile-row"
        :class="{ 'profile-row--active': profile.id === profiles.active }"
      >
        <div class="profile-row__main">
          <div class="profile-row__title-line">
            <strong class="profile-row__name">{{ profile.title }}</strong>
            <span v-if="profile.id === profiles.active" class="profile-row__badge">
              {{ t("settings.profiles.active") }}
            </span>
          </div>
          <span class="profile-row__meta">
            {{ presetsLabel(profile.presets) }} ·
            {{ filesLabel(profile.data_files) }}
            <span class="profile-row__id mono">{{ profile.id }}</span>
          </span>
        </div>

        <form
          v-if="renamingId === profile.id"
          class="profile-row__form"
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

        <div v-else class="profile-row__actions">
          <Button
            v-if="profile.id !== profiles.active"
            :label="t('settings.profiles.switch')"
            size="small"
            severity="secondary"
            outlined
            :disabled="status.switch.loading"
            @click="requestSwitch(profile)"
          />
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
            @click="requestDelete(profile)"
          />
        </div>

        <p
          v-if="renamingId === profile.id && status.rename.error"
          class="profile-row__error"
        >
          {{ status.rename.error }}
        </p>
      </li>
    </ul>

    <p v-if="status.switch.error" class="profiles__error">{{ status.switch.error }}</p>
    <p v-if="status.delete.error" class="profiles__error">{{ status.delete.error }}</p>
  </section>
</template>

<style scoped>
.profiles__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ag-space-lg);
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

.profiles__list {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}

.profile-row {
  display: flex;
  align-items: center;
  gap: var(--ag-space-lg);
  flex-wrap: wrap;
  padding: var(--ag-space-lg);
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-md);
  background: var(--ag-surface);
}

.profile-row--active {
  border-color: var(--p-primary-color);
}

.profile-row__main {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-xs);
  min-width: 200px;
  margin-right: auto;
}

.profile-row__title-line {
  display: flex;
  align-items: center;
  gap: var(--ag-space-sm);
}

.profile-row__name {
  font-size: var(--ag-text-md);
}

.profile-row__badge {
  padding: var(--ag-space-xs) var(--ag-space-sm);
  border-radius: var(--ag-radius-md);
  background: var(--p-primary-50);
  color: var(--p-primary-700);
  font-size: var(--ag-text-xs);
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
  display: flex;
  align-items: center;
  gap: var(--ag-space-sm);
  flex-wrap: wrap;
}

.profile-row__error,
.profiles__error {
  flex-basis: 100%;
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
</style>

<script setup lang="ts">
// Раздел «Язык»: выбор словаря и состояние внешних файлов (ADR 0039).
//
// Русский встроен и полон всегда. Остальные языки — файлы в
// `local/languages/`: их правит пользователь, приложение не перезаписывает.
// Раздел показывает, какие файлы не прочитаны и сколько ключей не переведено.

import Button from "primevue/button";
import { computed, onMounted, ref } from "vue";
import { describeError } from "@/core/infra/errors";
import { t } from "@/core/infra/i18n";
import { openFolder, status as appStatus } from "@/core/services/appInfo";
import {
  activateLanguage,
  BUILTIN_LANGUAGE,
  exportLanguageSample,
  languages,
  loadLanguages,
  status,
} from "@/core/services/languages";
import { setLanguage, settings } from "@/core/services/settings/index";

/** Выбранный язык: пишется в настройки и применяется сразу. */
const current = computed({
  get: () => settings.current?.ui.language ?? BUILTIN_LANGUAGE,
  set: (code: string) => {
    void setLanguage(code);
  },
});

/** Найденный внешний словарь выбранного языка. */
const active = computed(
  () => languages.items.find((item) => item.code === current.value) ?? null,
);

/** Файлы, которые не прочитаны: причина показывается под списком. */
const broken = computed(() =>
  languages.items.filter((item) => item.problem !== null),
);

/** Выбранный файл пропал или не читается: интерфейс показывает русский. */
const lost = computed(
  () =>
    languages.loaded &&
    current.value !== BUILTIN_LANGUAGE &&
    (active.value === null || active.value.problem !== null),
);

/** Куда записан последний образец. */
const exported = ref<string | null>(null);

/** Перечитывает папку и применяет правки действующего словаря. */
async function refresh(): Promise<void> {
  await loadLanguages();
  await activateLanguage(current.value);
}

/** Выгружает русский словарь образцом для нового перевода. */
async function exportSample(): Promise<void> {
  exported.value = await exportLanguageSample();
  if (exported.value !== null) await refresh();
}

onMounted(() => {
  void loadLanguages();
});
</script>

<template>
  <section class="language wb-section">
    <header class="wb-section__head">
      <h2 class="wb-section__title">{{ t("settings.language.title") }}</h2>
      <p class="wb-section__lead">{{ t("settings.language.lead") }}</p>
    </header>

    <p v-if="lost" class="language__warning">
      {{ t("settings.language.lost") }}
    </p>

    <div
      class="language__list"
      role="radiogroup"
      :aria-label="t('settings.language.current')"
    >
      <label
        class="language__item"
        :class="{ 'language__item--active': current === BUILTIN_LANGUAGE }"
      >
        <input
          type="radio"
          name="ui-language"
          :value="BUILTIN_LANGUAGE"
          v-model="current"
        />
        <span class="language__name">
          {{ t("settings.language.russian") }}
          <span class="language__code">{{ BUILTIN_LANGUAGE }}</span>
        </span>
        <span class="language__badge">
          {{ t("settings.language.builtin") }}
        </span>
      </label>

      <label
        v-for="item in languages.items"
        :key="item.code"
        class="language__item"
        :class="{ 'language__item--active': current === item.code }"
      >
        <input
          type="radio"
          name="ui-language"
          :value="item.code"
          v-model="current"
          :disabled="item.problem !== null"
        />
        <span class="language__name">
          {{ item.name }}
          <span class="language__code">{{ item.code }}</span>
        </span>
        <span
          v-if="item.problem !== null"
          class="language__badge language__badge--bad"
        >
          {{ t("settings.language.broken") }}
        </span>
        <span v-else-if="item.missing > 0" class="language__badge">
          {{ t("settings.language.missing") }}
        </span>
        <span v-else class="language__badge language__badge--ok">
          {{ t("settings.language.complete") }}
        </span>
      </label>
    </div>

    <p
      v-if="languages.items.length === 0 && languages.loaded"
      class="language__hint"
    >
      {{ t("settings.language.empty") }}
    </p>

    <p
      v-for="item in broken"
      :key="`problem-${item.code}`"
      class="language__error"
    >
      {{ item.problem ? describeError(item.problem) : "" }}
    </p>

    <p v-if="active !== null && active.missing > 0" class="language__hint">
      {{ t("settings.language.partial", { count: active.missing }) }}
    </p>

    <p v-if="active !== null && active.extra > 0" class="language__hint">
      {{ t("settings.language.extra", { count: active.extra }) }}
    </p>

    <p v-if="status.list.error" class="language__error">
      {{ status.list.error }}
    </p>

    <div class="language__actions">
      <Button
        :label="t('settings.language.refresh')"
        icon="pi pi-refresh"
        size="small"
        severity="secondary"
        outlined
        :loading="status.list.loading"
        @click="refresh"
      />
      <Button
        :label="t('settings.language.open_folder')"
        icon="pi pi-folder-open"
        size="small"
        severity="secondary"
        outlined
        :loading="appStatus.folder.loading"
        @click="openFolder('languages')"
      />
      <Button
        :label="t('settings.language.export')"
        icon="pi pi-download"
        size="small"
        severity="secondary"
        text
        :loading="status.export.loading"
        @click="exportSample"
      />
    </div>

    <p v-if="exported !== null" class="language__hint">
      {{ t("settings.language.exported", { path: exported }) }}
    </p>
    <p v-if="status.export.error" class="language__error">
      {{ status.export.error }}
    </p>

    <p class="language__note">{{ t("settings.language.note") }}</p>
  </section>
</template>

<style scoped>
.language__list {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-sm);
}

.language__item {
  display: flex;
  align-items: center;
  gap: var(--ag-space-md);
  padding: var(--ag-space-lg);
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-md);
  background: var(--ag-surface);
  cursor: pointer;
}

/* Отметка выбора — цветом действия, а не системным синим. */
.language__item input {
  accent-color: var(--p-primary-color);
}

.language__item--active {
  border-color: var(--p-primary-color);
  background: var(--p-surface-100);
}

.language__name {
  display: flex;
  align-items: baseline;
  gap: var(--ag-space-sm);
  flex: 1;
  font-size: var(--ag-text-sm);
}

.language__code {
  color: var(--p-text-muted-color);
  font-family: var(--ag-font-mono);
  font-size: var(--ag-text-xs);
}

.language__badge {
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.language__badge--bad {
  color: var(--ag-danger);
}

.language__badge--ok {
  color: var(--p-primary-color);
}

.language__warning {
  margin: 0;
  padding: var(--ag-space-lg);
  border: 1px solid color-mix(in srgb, var(--ag-danger) 35%, transparent);
  border-radius: var(--ag-radius-md);
  background: color-mix(in srgb, var(--ag-danger) 8%, transparent);
  color: var(--ag-text);
  font-size: var(--ag-text-sm);
  line-height: 1.5;
}

.language__actions {
  display: flex;
  align-items: center;
  gap: var(--ag-space-sm);
  flex-wrap: wrap;
}

.language__hint {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-sm);
}

.language__error {
  margin: 0;
  color: var(--ag-danger);
  font-size: var(--ag-text-xs);
  line-height: 1.45;
}

.language__note {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
  line-height: 1.5;
  white-space: pre-line;
}
</style>

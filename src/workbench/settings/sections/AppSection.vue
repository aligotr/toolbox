<script setup lang="ts">
// Раздел «Программа»: версия и режим сборки.
//
// Это справка, а не переключатели: менять здесь нечего. Папку программы
// открывают, чтобы положить рядом файл или посмотреть, что занимает место.

import Button from "primevue/button";
import { computed, onMounted } from "vue";
import appIcon from "@/assets/app-icon.png";
import { t } from "@/core/infra/i18n";
import { appInfo, loadAppInfo, openFolder, status } from "@/core/services/appInfo";

const info = computed(() => appInfo.current);

const buildMode = computed(() =>
  info.value?.debug ? t("settings.app.debug") : t("settings.app.release"),
);

onMounted(() => {
  void loadAppInfo();
});
</script>

<template>
  <section class="app wb-section">
    <header class="wb-section__head">
      <h2 class="wb-section__title">{{ t("settings.section.app") }}</h2>
    </header>

    <div class="app__hero">
      <img class="app__icon" :src="appIcon" alt="" width="64" height="64" />
      <div class="app__brand">
        <strong class="app__name">ToolBox</strong>
        <p class="app__lead">{{ t("settings.app.lead") }}</p>
      </div>
    </div>

    <p v-if="status.load.error" class="app__error">{{ status.load.error }}</p>
    <p v-if="!appInfo.loaded" class="app__note">{{ t("settings.app.loading") }}</p>

    <dl v-else-if="info" class="app__facts">
      <div class="app__fact">
        <dt>{{ t("settings.app.version") }}</dt>
        <dd>{{ info.version }}</dd>
      </div>
      <div class="app__fact">
        <dt>{{ t("settings.app.buildMode") }}</dt>
        <dd>{{ buildMode }}</dd>
      </div>
    </dl>

    <div class="app__actions">
      <Button
        :label="t('settings.app.openFolder')"
        icon="pi pi-folder-open"
        size="small"
        severity="secondary"
        outlined
        :loading="status.folder.loading"
        :disabled="!info"
        @click="openFolder('root')"
      />
    </div>

    <p v-if="status.folder.error" class="app__error">{{ status.folder.error }}</p>
  </section>
</template>

<style scoped>
/* Знак приложения и имя стоят вместе: описание читается как подпись
   к инструменту, а не как ещё один абзац раздела. */
.app__hero {
  display: flex;
  align-items: center;
  gap: var(--ag-space-lg);
  padding: var(--ag-space-lg);
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-md);
  background: var(--ag-surface);
}

.app__icon {
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  object-fit: contain;
}

.app__brand {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-xs);
  min-width: 0;
}

.app__name {
  font-size: var(--ag-text-lg);
  font-weight: 600;
}

.app__lead {
  max-width: 68ch;
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-sm);
  line-height: 1.5;
}

.app__facts {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-lg);
  margin: 0;
}

.app__fact {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-xs);
  padding: var(--ag-space-lg);
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-md);
  background: var(--ag-surface);
}

.app__fact dt {
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.app__fact dd {
  margin: 0;
  font-size: var(--ag-text-sm);
  overflow-wrap: anywhere;
}

.app__actions {
  display: flex;
  align-items: center;
  gap: var(--ag-space-sm);
  flex-wrap: wrap;
}

.app__note {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-sm);
}

.app__error {
  margin: 0;
  color: var(--ag-danger);
  font-size: var(--ag-text-xs);
  line-height: 1.45;
}
</style>

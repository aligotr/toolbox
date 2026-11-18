<script setup lang="ts">
// Раздел «Программа»: версия и режим сборки.
//
// Это справка, а не переключатели: менять здесь нечего. Папку программы
// открывают, чтобы положить рядом файл или посмотреть, что занимает место.

import Button from "primevue/button";
import { computed, onMounted } from "vue";
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
      <p class="wb-section__lead">{{ t("settings.app.lead") }}</p>
    </header>

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

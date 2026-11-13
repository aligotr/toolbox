<script setup lang="ts">
// Раздел «Программа»: версия, режим сборки, папка и активный профиль.
//
// Это справка, а не переключатели: менять здесь нечего. Папку программы
// открывают, чтобы положить рядом файл или посмотреть, что занимает место.

import Button from "primevue/button";
import { computed, onMounted } from "vue";
import { appInfo, loadAppInfo, openFolder, status } from "../../core/appInfo";

const info = computed(() => appInfo.current);

const buildMode = computed(() =>
  info.value?.debug ? "отладочная (cargo run / tauri dev)" : "релизная",
);

const profileLabel = computed(() => {
  const current = info.value;
  if (!current) return "—";
  return current.profile_title === current.profile
    ? current.profile
    : `${current.profile_title} (${current.profile})`;
});

onMounted(() => {
  void loadAppInfo();
});
</script>

<template>
  <section class="app">
    <header class="app__head">
      <h2 class="app__title">Программа</h2>
      <p class="app__lead">
        Сведения о сборке и месте, где лежат настройки, лог и профили.
        Всё состояние хранится рядом с исполняемым файлом.
      </p>
    </header>

    <p v-if="status.load.error" class="app__error">{{ status.load.error }}</p>
    <p v-if="!appInfo.loaded" class="app__note">Сведения читаются…</p>

    <dl v-else-if="info" class="app__facts">
      <div class="app__fact">
        <dt>Версия</dt>
        <dd>{{ info.version }}</dd>
      </div>
      <div class="app__fact">
        <dt>Режим сборки</dt>
        <dd>{{ buildMode }}</dd>
      </div>
      <div class="app__fact">
        <dt>Активный профиль</dt>
        <dd>{{ profileLabel }}</dd>
      </div>
      <div class="app__fact">
        <dt>Папка программы</dt>
        <dd class="mono">{{ info.root }}</dd>
      </div>
    </dl>

    <div class="app__actions">
      <Button
        label="Открыть папку программы"
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
.app {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-lg);
}

.app__head {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-sm);
}

.app__title {
  margin: 0;
  font-size: var(--ag-text-lg);
  font-weight: 600;
}

.app__lead {
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

.mono {
  font-family: var(--ag-font-mono);
  font-size: var(--ag-text-xs);
}
</style>

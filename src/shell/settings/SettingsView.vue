<script setup lang="ts">
// Центр управления: вертикальный список разделов и содержимое выбранного.
//
// Настройки инструментов здесь не живут — у каждого инструмента свой экран
// (правило проекта). Этот экран отвечает за приложение: журнал, окно,
// профили, шаблоны, данные и сведения о сборке.
//
// Выбранный раздел хранится вне компонента (`state.ts`): сайдбар открывает
// ту же вкладку сразу на «Профилях», не дожидаясь монтирования.

import { onMounted } from "vue";
import type { ToolDescriptor } from "../../contracts/tools";
import { loadSettings } from "../../core/settings";
import AppSection from "./AppSection.vue";
import DataSection from "./DataSection.vue";
import LogSection from "./LogSection.vue";
import ProfilesSection from "./ProfilesSection.vue";
import TemplatesSection from "./TemplatesSection.vue";
import WindowSection from "./WindowSection.vue";
import { activeSection, openSettingsSection, SETTINGS_SECTIONS } from "./state";

defineProps<{ tools: ToolDescriptor[] }>();

onMounted(() => {
  void loadSettings();
});
</script>

<template>
  <section class="settings">
    <header class="settings__head">
      <h1 class="settings__title">Настройки</h1>
      <p class="settings__lead">
        Журнал, окно, профили, шаблоны, данные и сведения о программе.
      </p>
    </header>

    <div class="settings__body">
      <nav class="settings__nav" aria-label="Разделы настроек">
        <button
          v-for="section in SETTINGS_SECTIONS"
          :key="section.id"
          class="settings__nav-item"
          :class="{ 'settings__nav-item--active': activeSection === section.id }"
          type="button"
          :aria-current="activeSection === section.id ? 'page' : undefined"
          @click="openSettingsSection(section.id)"
        >
          <i class="settings__nav-icon" :class="section.icon" aria-hidden="true" />
          <span>{{ section.title }}</span>
        </button>
      </nav>

      <div class="settings__content">
        <LogSection v-if="activeSection === 'log'" />
        <WindowSection v-else-if="activeSection === 'window'" />
        <ProfilesSection v-else-if="activeSection === 'profiles'" />
        <TemplatesSection v-else-if="activeSection === 'templates'" />
        <DataSection v-else-if="activeSection === 'data'" :tools="tools" />
        <AppSection v-else-if="activeSection === 'app'" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-heading);
  height: 100%;
  max-width: 1120px;
  margin: 0 auto;
  padding: var(--ag-space-2xl);
  min-height: 0;
}

.settings__head {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-sm);
}

.settings__title {
  margin: 0;
  font-size: var(--ag-text-xl);
  line-height: 1.25;
}

.settings__lead {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-md);
}

.settings__body {
  display: grid;
  flex: 1;
  grid-template-columns: 200px minmax(0, 1fr);
  gap: var(--ag-space-2xl);
  min-height: 0;
}

.settings__nav {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-xs);
  min-width: 0;
  min-height: 0;
  overflow: auto;
}

.settings__nav-item {
  display: flex;
  align-items: center;
  gap: var(--ag-space-sm);
  width: 100%;
  padding: var(--ag-space-sm) var(--ag-space-lg);
  border: 1px solid transparent;
  border-radius: var(--ag-radius-md);
  background: transparent;
  color: var(--p-text-muted-color);
  font: inherit;
  font-size: var(--ag-text-md);
  text-align: left;
  cursor: pointer;
}

.settings__nav-item:hover {
  background: var(--ag-surface-2);
  color: var(--p-text-color);
}

.settings__nav-item--active {
  background: var(--p-surface-100);
  color: var(--p-text-color);
}

.settings__nav-item:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.settings__nav-icon {
  flex-shrink: 0;
  width: 18px;
  font-size: 16px;
  text-align: center;
}

.settings__content {
  min-width: 0;
  min-height: 0;
  overflow: auto;
}
</style>

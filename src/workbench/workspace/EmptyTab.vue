<script setup lang="ts">
// Пустая вкладка - «главная» рабочего пространства.
//
// Отдельного экрана «Главная» нет: при запуске и по кнопке «плюс» открывается
// вкладка, на которой видно, с чего начать (ADR 0011). Экран показывает
// каталог: инструменты отдельно, приложение отдельно (ADR 0062).
//
// Дескриптор сам называет группу: оболочка имён инструментов не знает,
// а карточки разделов приложения открывают те же одиночные вкладки, что
// и сайдбар.

import { computed, onMounted, ref } from "vue";
import type { ToolDescriptor } from "@/contracts/tools";
import { SINGLETON_TABS } from "@/core/constants";
import { t } from "@/core/infra/i18n";
import { defaultPresetTitle } from "@/core/services/presets/defaultPreset";
import type { StartupStatus } from "@/core/services/startup";
import { openSingleton } from "@/core/services/workspace/index";
import { openToolOnAuxClick, openToolOnClick, openToolOnKeydown } from "../toolGestures";
import CatalogCard from "./CatalogCard.vue";

const props = defineProps<{ tools: ToolDescriptor[]; startup: StartupStatus | null }>();

/** Инструменты и приложение: место в каталоге называет дескриптор. */
const toolItems = computed(() => props.tools.filter((tool) => tool.group !== "app"));
const appItems = computed(() => props.tools.filter((tool) => tool.group === "app"));

/** Разделы приложения в порядке каталога: журнал, затем настройки. */
const appSections = (["journal", "settings"] as const).map((kind) => ({
  kind,
  ...SINGLETON_TABS[kind],
}));

/** Названия пресетов по умолчанию: подпись говорит, что загрузит новая вкладка. */
const presetTitles = ref<Record<string, string>>({});

onMounted(async () => {
  const found = await Promise.all(
    toolItems.value.map(async (tool) => ({
      id: tool.id,
      title: await defaultPresetTitle(tool.id),
    })),
  );

  const titles: Record<string, string> = {};
  for (const item of found) {
    if (item.title !== null) titles[item.id] = item.title;
  }
  presetTitles.value = titles;
});

/** Подпись пресета по умолчанию; `undefined` - умолчания нет. */
function presetLine(id: string): string | undefined {
  const title = presetTitles.value[id];
  return title === undefined ? undefined : t("workspace.empty.preset", { title });
}
</script>

<template>
  <section class="empty wb-screen">
    <header class="wb-screen__head">
      <h1 class="wb-screen__title">{{ t("workspace.empty.title") }}</h1>
      <p class="wb-screen__lead">{{ t("workspace.empty.lead") }}</p>
    </header>

    <div class="wb-screen__body empty__body">
      <section class="wb-section">
        <h2 class="wb-section__title">{{ t("workspace.empty.tools") }}</h2>

        <div v-if="toolItems.length" class="empty__grid empty__grid--tools">
          <CatalogCard
            v-for="tool in toolItems"
            :key="tool.id"
            :icon="tool.icon"
            :title="tool.title"
            :preset="presetLine(tool.id)"
            :description="tool.descriptionKey ? t(tool.descriptionKey) : undefined"
            v-tooltip.bottom="{
              value: t('tools.open.anotherTab'),
              disabled: !tool.multipleTabs,
            }"
            @click="openToolOnClick(tool, $event)"
            @auxclick="openToolOnAuxClick(tool, $event)"
            @keydown="openToolOnKeydown(tool, $event)"
          />
        </div>

        <p v-else class="empty__note">{{ t("workspace.empty.toolsNone") }}</p>
      </section>

      <section class="wb-section">
        <h2 class="wb-section__title">{{ t("workspace.empty.app") }}</h2>

        <div class="empty__grid">
          <CatalogCard
            v-for="tool in appItems"
            :key="tool.id"
            :icon="tool.icon"
            :title="tool.title"
            :description="tool.descriptionKey ? t(tool.descriptionKey) : undefined"
            v-tooltip.bottom="{
              value: t('tools.open.anotherTab'),
              disabled: !tool.multipleTabs,
            }"
            @click="openToolOnClick(tool, $event)"
            @auxclick="openToolOnAuxClick(tool, $event)"
            @keydown="openToolOnKeydown(tool, $event)"
          />

          <CatalogCard
            v-for="section in appSections"
            :key="section.kind"
            :icon="section.icon"
            :title="t(section.titleKey)"
            :description="t(section.descriptionKey)"
            @click="openSingleton(section.kind)"
          />
        </div>
      </section>

      <footer class="empty__status">
        <span class="status__dot" :class="{ 'status__dot--off': !startup }" aria-hidden="true" />
        <span>{{ startup ? t("workspace.empty.coreOn") : t("workspace.empty.coreOff") }}</span>
        <span v-if="startup" class="status__path">{{ startup.root }}</span>
      </footer>
    </div>
  </section>
</template>

<style scoped>
.empty {
  max-width: var(--ag-content-catalog);
  margin: 0 auto;
  padding: var(--ag-space-lg);
  overflow: auto;
}

.empty__body {
  gap: var(--ag-space-2xl);
}

.empty__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--ag-space-lg);
}

/* Инструментов на экране запуска мало: карточка занимает строку целиком. */
.empty__grid--tools {
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.empty__note {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-sm);
}

.empty__status {
  display: flex;
  align-items: center;
  gap: var(--ag-space-sm);
  min-width: 0;
  margin-top: auto;
  padding-top: var(--ag-space-lg);
  border-top: 1px solid var(--ag-border);
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.status__dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: var(--ag-radius-round);
  background: var(--ag-ok);
}

.status__dot--off {
  background: var(--p-surface-400);
}

.status__path {
  overflow: hidden;
  font-family: var(--ag-font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

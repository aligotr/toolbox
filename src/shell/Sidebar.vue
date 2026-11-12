<script setup lang="ts">
// Сайдбар: инструменты, журнал, настройки и профиль.
//
// Оболочка не знает имён инструментов — она раскладывает дескрипторы,
// полученные из точки сборки. Журнал и настройки принадлежат оболочке:
// это не инструменты, а разделы приложения.
//
// Свёрнутый вид — рейл 64 px с иконками и подсказками. Ширина меняется без
// анимации: `width` — свойство раскладки, а движение здесь ничего не сообщает
// пользователю (правила интерфейса).

import Menu from "primevue/menu";
import type { MenuItem } from "primevue/menuitem";
import { computed, onMounted, ref } from "vue";
import type { ToolDescriptor } from "../contracts/tools";
import { SINGLETON_TABS } from "../core/constants";
import { activeProfile, loadProfiles, profiles, status } from "../core/profiles";
import { openSingleton, openTool, workspace } from "../core/workspace";
import {
  COLLAPSE_TOOLTIP,
  EXPAND_TOOLTIP,
  PROFILE_FALLBACK,
  PROFILE_MANAGE,
  PROFILE_TOOLTIP,
} from "./constants";
import { openSettingsSection } from "./settings/state";
import { useProfiles } from "./settings/useProfiles";

defineProps<{ tools: ToolDescriptor[]; collapsed: boolean }>();

const emit = defineEmits<{ toggle: [] }>();

const profileMenu = ref<InstanceType<typeof Menu> | null>(null);
const { requestSwitch } = useProfiles();

/** Активная вкладка: по ней подсвечиваются пункты, которые уже открыты. */
const activeTab = computed(
  () => workspace.tabs.find((tab) => tab.id === workspace.activeId) ?? null,
);

/** Подпись профиля: название из ядра, пока его нет — нейтральное слово. */
const profileTitle = computed(() => activeProfile.value?.title ?? PROFILE_FALLBACK);

/**
 * Пункты меню профиля.
 *
 * Активный профиль отмечен и недоступен: повторный выбор ничего не изменил бы,
 * а перезапуск без причины выглядит поломкой.
 */
const profileItems = computed<MenuItem[]>(() => {
  const items: MenuItem[] = profiles.items.map((profile) => ({
    label: profile.title,
    icon: profile.id === profiles.active ? "pi pi-check" : "pi pi-user",
    disabled: profile.id === profiles.active,
    command: () => requestSwitch(profile),
  }));

  if (status.list.error) {
    items.push({
      label: `Список профилей не прочитан: ${status.list.error}`,
      icon: "pi pi-exclamation-triangle",
      disabled: true,
    });
  }

  items.push(
    { separator: true },
    {
      label: PROFILE_MANAGE,
      icon: "pi pi-cog",
      command: () => {
        openSettingsSection("profiles");
        openSingleton("settings");
      },
    },
  );
  return items;
});

function toggleProfileMenu(event: MouseEvent): void {
  profileMenu.value?.toggle(event);
}

onMounted(() => {
  void loadProfiles();
});

/** Открыт ли инструмент в активной вкладке. */
function toolIsActive(id: string): boolean {
  const tab = activeTab.value;
  return tab?.kind === "workspace" && tab.columns.some((column) => column.tools.includes(id));
}

/** Открыт ли раздел приложения в активной вкладке. */
function sectionIsActive(kind: "journal" | "settings"): boolean {
  return activeTab.value?.kind === kind;
}
</script>

<template>
  <aside class="sidebar" :class="{ 'sidebar--rail': collapsed }">
    <header class="sidebar__head">
      <div v-if="!collapsed" class="brand">
        <span class="brand__mark">TB</span>
        <strong class="brand__name">ToolBox</strong>
      </div>

      <button
        class="sidebar__toggle"
        type="button"
        :aria-label="collapsed ? EXPAND_TOOLTIP : COLLAPSE_TOOLTIP"
        v-tooltip.bottom="collapsed ? EXPAND_TOOLTIP : COLLAPSE_TOOLTIP"
        @click="emit('toggle')"
      >
        <i class="pi" :class="collapsed ? 'pi-angle-right' : 'pi-angle-left'" aria-hidden="true" />
      </button>
    </header>

    <nav class="nav" aria-label="Инструменты">
      <span v-if="!collapsed" class="nav__label">Инструменты</span>

      <button
        v-for="tool in tools"
        :key="tool.id"
        class="nav__item"
        :class="{ 'nav__item--active': toolIsActive(tool.id) }"
        type="button"
        :aria-label="tool.title"
        v-tooltip.right="{ value: tool.title, disabled: !collapsed }"
        @click="openTool(tool)"
      >
        <i class="nav__icon" :class="tool.icon" aria-hidden="true" />
        <span v-if="!collapsed" class="nav__title">{{ tool.title }}</span>
      </button>

      <p v-if="!tools.length && !collapsed" class="nav__empty">Пока нет инструментов</p>
    </nav>

    <nav class="nav" aria-label="Приложение">
      <span v-if="!collapsed" class="nav__label">Приложение</span>

      <button
        class="nav__item"
        :class="{ 'nav__item--active': sectionIsActive('journal') }"
        type="button"
        :aria-label="SINGLETON_TABS.journal.title"
        v-tooltip.right="{ value: SINGLETON_TABS.journal.title, disabled: !collapsed }"
        @click="openSingleton('journal')"
      >
        <i class="nav__icon" :class="SINGLETON_TABS.journal.icon" aria-hidden="true" />
        <span v-if="!collapsed" class="nav__title">{{ SINGLETON_TABS.journal.title }}</span>
      </button>

      <button
        class="nav__item"
        :class="{ 'nav__item--active': sectionIsActive('settings') }"
        type="button"
        :aria-label="SINGLETON_TABS.settings.title"
        v-tooltip.right="{ value: SINGLETON_TABS.settings.title, disabled: !collapsed }"
        @click="openSingleton('settings')"
      >
        <i class="nav__icon" :class="SINGLETON_TABS.settings.icon" aria-hidden="true" />
        <span v-if="!collapsed" class="nav__title">{{ SINGLETON_TABS.settings.title }}</span>
      </button>
    </nav>

    <div class="sidebar__profile">
      <button
        class="profile-button"
        type="button"
        :aria-label="`Профиль: ${profileTitle}`"
        v-tooltip.right="{ value: PROFILE_TOOLTIP, disabled: !collapsed }"
        @click="toggleProfileMenu"
      >
        <i class="nav__icon pi pi-user" aria-hidden="true" />
        <span v-if="!collapsed" class="nav__title">{{ profileTitle }}</span>
        <i v-if="!collapsed" class="pi pi-angle-up profile-button__chevron" aria-hidden="true" />
      </button>

      <Menu ref="profileMenu" :model="profileItems" popup />
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: var(--ag-sidebar-width);
  padding: 8px;
  overflow: hidden;
  background: var(--ag-bg);
  border-right: 1px solid var(--ag-border);
}

.sidebar--rail {
  width: var(--ag-rail-width);
}

.sidebar__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 40px;
}

.sidebar--rail .sidebar__head {
  justify-content: center;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding-left: 4px;
}

.brand__mark {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
  font-size: 13px;
  font-weight: 700;
}

.brand__name {
  overflow: hidden;
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar__toggle {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--p-text-muted-color);
  font-size: 14px;
  cursor: pointer;
}

.sidebar__toggle:hover {
  background: var(--ag-hover);
  color: var(--p-text-color);
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.nav__label {
  padding: 16px 8px 0;
  color: var(--p-text-muted-color);
  font-size: 13px;
}

.nav__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding: 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--p-text-muted-color);
  font: inherit;
  font-size: 15px;
  text-align: left;
  cursor: pointer;
}

.nav__item:hover {
  background: var(--ag-hover);
  color: var(--p-text-color);
}

.nav__item--active {
  background: var(--ag-surface);
  color: var(--p-text-color);
}

.nav__item:focus-visible,
.sidebar__toggle:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.sidebar--rail .nav__item {
  justify-content: center;
  padding: 8px 0;
}

.nav__icon {
  flex-shrink: 0;
  width: 18px;
  font-size: 16px;
  text-align: center;
}

.nav__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav__empty {
  margin: 0;
  padding: 4px 8px;
  color: var(--p-text-muted-color);
  font-size: 13px;
  line-height: 1.4;
}

.sidebar__profile {
  display: flex;
  align-items: center;
  min-width: 0;
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid var(--ag-border);
}

.sidebar--rail .sidebar__profile {
  justify-content: center;
}

.profile-button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding: 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--p-text-muted-color);
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.profile-button:hover {
  background: var(--ag-hover);
  color: var(--p-text-color);
}

.profile-button:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.sidebar--rail .profile-button {
  justify-content: center;
  padding: 8px 0;
}

.profile-button__chevron {
  flex-shrink: 0;
  margin-left: auto;
  font-size: 13px;
}
</style>

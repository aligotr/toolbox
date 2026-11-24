<script setup lang="ts">
// Сайдбар: инструменты, журнал, настройки и профиль.
//
// Оболочка не знает имён инструментов — она раскладывает дескрипторы,
// полученные из точки сборки. Журнал и настройки принадлежат оболочке:
// это не инструменты, а разделы приложения.
//
// Пункты рейла рисует `RailItem`: сайдбар отвечает за раскладку и группы,
// а вид и состояния пункта живут в одном месте и не копируются четыре раза.
//
// Свёрнутый вид — рейл 64 px с иконками и подсказками. Ширина меняется без
// анимации: `width` — свойство раскладки, а движение здесь ничего не сообщает
// пользователю (правила интерфейса).

import Menu from "primevue/menu";
import type { MenuItem } from "primevue/menuitem";
import { computed, onMounted, ref } from "vue";
import type { ToolDescriptor } from "@/contracts/tools";
import { SINGLETON_TABS } from "@/core/constants";
import { t } from "@/core/infra/i18n";
import { activeProfile, loadProfiles, profiles, status } from "@/core/services/profiles";
import { openSingleton, workspace } from "@/core/services/workspace/index";
import brandMark from "@/assets/brand.png";
import RailItem from "./RailItem.vue";
import { openToolOnAuxClick, openToolOnClick, openToolOnKeydown } from "../toolGestures";
import { openSettingsSection } from "../settings/navigation";
import { useProfiles } from "../settings/useProfiles";

const props = defineProps<{ tools: ToolDescriptor[]; collapsed: boolean }>();

const emit = defineEmits<{ toggle: [] }>();

const profileMenu = ref<InstanceType<typeof Menu> | null>(null);
const { requestSwitch } = useProfiles();

/**
 * Пункты рейла по группам.
 *
 * Инструмент сам называет свою группу в дескрипторе: оболочка имён
 * не знает. Пункты группы `app` стоят перед журналом и настройками.
 */
const toolItems = computed(() => props.tools.filter((tool) => tool.group !== "app"));
const appToolItems = computed(() => props.tools.filter((tool) => tool.group === "app"));

/** Активная вкладка: по ней подсвечиваются пункты, которые уже открыты. */
const activeTab = computed(
  () => workspace.tabs.find((tab) => tab.id === workspace.activeId) ?? null,
);

/** Подпись профиля: название из ядра, пока его нет — нейтральное слово. */
const profileTitle = computed(() => activeProfile.value?.title ?? t("shell.profile.fallback"));

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
      label: t("shell.profile.listError", { reason: status.list.error }),
      icon: "pi pi-exclamation-triangle",
      disabled: true,
    });
  }

  items.push(
    { separator: true },
    {
      label: t("shell.profile.manage"),
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
        <img class="brand__mark" :src="brandMark" alt="" />
        <strong class="brand__name">ToolBox</strong>
      </div>

      <button
        class="sidebar__toggle"
        type="button"
        :aria-label="collapsed ? t('shell.sidebar.expand') : t('shell.sidebar.collapse')"
        v-tooltip.bottom="collapsed ? t('shell.sidebar.expand') : t('shell.sidebar.collapse')"
        @click="emit('toggle')"
      >
        <i class="pi" :class="collapsed ? 'pi-angle-right' : 'pi-angle-left'" aria-hidden="true" />
      </button>
    </header>

    <nav class="nav" :aria-label="t('common.tools')">
      <span v-if="!collapsed" class="nav__label">{{ t("common.tools") }}</span>

      <RailItem
        v-for="tool in toolItems"
        :key="tool.id"
        :icon="tool.icon"
        :title="tool.title"
        :hint="tool.multipleTabs ? t('tools.open.anotherTab') : undefined"
        :collapsed="collapsed"
        :active="toolIsActive(tool.id)"
        @click="openToolOnClick(tool, $event)"
        @auxclick="openToolOnAuxClick(tool, $event)"
        @keydown="openToolOnKeydown(tool, $event)"
      />

      <p v-if="!toolItems.length && !collapsed" class="nav__empty">
        {{ t("shell.sidebar.noTools") }}
      </p>
    </nav>

    <nav class="nav" :aria-label="t('common.app')">
      <span v-if="!collapsed" class="nav__label">{{ t("common.app") }}</span>

      <RailItem
        v-for="tool in appToolItems"
        :key="tool.id"
        :icon="tool.icon"
        :title="tool.title"
        :hint="tool.multipleTabs ? t('tools.open.anotherTab') : undefined"
        :collapsed="collapsed"
        :active="toolIsActive(tool.id)"
        @click="openToolOnClick(tool, $event)"
        @auxclick="openToolOnAuxClick(tool, $event)"
        @keydown="openToolOnKeydown(tool, $event)"
      />

      <RailItem
        :icon="SINGLETON_TABS.journal.icon"
        :title="t(SINGLETON_TABS.journal.titleKey)"
        :collapsed="collapsed"
        :active="sectionIsActive('journal')"
        @click="openSingleton('journal')"
      />

      <RailItem
        :icon="SINGLETON_TABS.settings.icon"
        :title="t(SINGLETON_TABS.settings.titleKey)"
        :collapsed="collapsed"
        :active="sectionIsActive('settings')"
        @click="openSingleton('settings')"
      />
    </nav>

    <div class="sidebar__profile">
      <RailItem
        icon="pi pi-user"
        :title="profileTitle"
        :label="t('shell.profile.label', { title: profileTitle })"
        :tooltip="t('shell.profile.tooltip')"
        :collapsed="collapsed"
        compact
        chevron
        @click="toggleProfileMenu"
      />

      <Menu ref="profileMenu" :model="profileItems" popup />
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-sm);
  width: var(--ag-sidebar-width);
  padding: var(--ag-space-sm);
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
  gap: var(--ag-space-sm);
  min-height: 40px;
}

.sidebar--rail .sidebar__head {
  justify-content: center;
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--ag-space-sm);
  min-width: 0;
  padding-left: var(--ag-space-xs);
}

/* Плитки шапки: знак и переключатель занимают одно место, различается
   только содержимое. */
.brand__mark,
.sidebar__toggle {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: var(--ag-tile-size);
  height: var(--ag-tile-size);
  border-radius: var(--ag-radius-md);
}

/* Знак приложения - его собственный цвет: подложка не спорит с логотипом
   и не тратит основной акцент на украшение шапки (ADR 0019). */
.brand__mark {
  object-fit: contain;
}

.brand__name {
  overflow: hidden;
  font-size: var(--ag-text-md);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar__toggle {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-sm);
  cursor: pointer;
}

.sidebar__toggle:hover {
  background: var(--ag-hover);
  color: var(--p-text-color);
}

.sidebar__toggle:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.nav {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* Подпись группы — такая же строка, как пункт: те же 8 px внутреннего
   отступа. Поэтому расстояние между текстами всех строк одинаково. */
.nav__label {
  margin: 0;
  padding: var(--ag-space-sm);
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.nav__empty {
  margin: 0;
  padding: var(--ag-space-xs) var(--ag-space-sm);
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
  line-height: 1.4;
}

.sidebar__profile {
  display: flex;
  align-items: center;
  min-width: 0;
  margin-top: auto;
  padding-top: var(--ag-space-sm);
  border-top: 1px solid var(--ag-border);
}

.sidebar--rail .sidebar__profile {
  justify-content: center;
}
</style>

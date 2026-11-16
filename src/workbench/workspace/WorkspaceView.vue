<script setup lang="ts">
// Содержимое активной вкладки.
//
// Разбор по виду вкладки — единственное место, где оболочка знает разницу
// между рабочим местом, журналом и настройками. Сами экраны ничего
// о вкладках не знают, поэтому их можно открыть и отдельно.

import { computed, type Component } from "vue";
import type { ToolDescriptor } from "@/contracts/tools";
import type { StartupStatus } from "@/core/services/startup";
import { workspace } from "@/core/services/workspace/index";
import JournalView from "../JournalView.vue";
import SettingsView from "../settings/SettingsView.vue";
import EmptyTab from "./EmptyTab.vue";
import ToolGrid from "./ToolGrid.vue";

defineProps<{
  tools: ToolDescriptor<Component>[];
  startup: StartupStatus | null;
}>();

const activeTab = computed(
  () => workspace.tabs.find((tab) => tab.id === workspace.activeId) ?? null,
);
</script>

<template>
  <main class="workspace">
    <template v-if="activeTab">
      <template v-if="activeTab.kind === 'workspace'">
        <EmptyTab v-if="!activeTab.columns.length" :tools="tools" :startup="startup" />
        <ToolGrid v-else :tab-id="activeTab.id" :columns="activeTab.columns" :tools="tools" />
      </template>

      <JournalView v-else-if="activeTab.kind === 'journal'" />
      <SettingsView v-else-if="activeTab.kind === 'settings'" :tools="tools" />
    </template>
  </main>
</template>

<style scoped>
.workspace {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--ag-surface);
}
</style>

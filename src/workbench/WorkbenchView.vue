<script setup lang="ts">
// Каркас рабочего пространства.
//
// Оболочка собрана из трёх частей: сайдбар, полоса вкладок и содержимое
// активной вкладки. Инструменты она получает готовыми дескрипторами из
// точки сборки, поэтому не импортирует ни одного `tools/*` (ADR 0012).
//
// Ctrl+B — единственная горячая клавиша оболочки. Обработчик живёт здесь,
// потому что меняет состояние всей оболочки, а не отдельной панели.

import { onMounted, onUnmounted, ref, type Component } from "vue";
import type { ToolDescriptor } from "@/contracts/tools";
import { setSidebarCollapsed, settings } from "@/core/services/settings/index";
import type { StartupStatus } from "@/core/services/startup";
import { loadTemplates } from "@/core/services/templates/index";
import { ensureWorkspace, startWorkspace } from "@/core/services/workspace/index";
import Sidebar from "./Sidebar.vue";
import TabStrip from "./tabs/TabStrip.vue";
import WorkspaceView from "./workspace/WorkspaceView.vue";
import "./styles.css";

const props = defineProps<{
  tools: ToolDescriptor<Component>[];
  startup: StartupStatus | null;
}>();

/** Свёрнут ли сайдбар. Значение приходит из настроек и переживает перезапуск. */
const collapsed = ref(settings.current?.ui.sidebar_collapsed ?? false);

/** Остановка чтения и записи рабочего пространства; `null` — файл не подключён. */
let stopWorkspace: (() => void) | null = null;

function toggleSidebar(): void {
  collapsed.value = !collapsed.value;
  void setSidebarCollapsed(collapsed.value);
}

/**
 * Ctrl+B: латинская раскладка не требуется — сверяем код клавиши.
 *
 * `event.code` одинаков в любой раскладке, а `event.key` зависит от неё.
 */
function onKeydown(event: KeyboardEvent): void {
  if (event.repeat || !event.ctrlKey || event.altKey || event.shiftKey) return;
  if (event.code !== "KeyB") return;

  event.preventDefault();
  toggleSidebar();
}

onMounted(async () => {
  window.addEventListener("keydown", onKeydown);

  // Без ядра (отладка одной страницы) сохранять некуда: оболочка просто
  // открывает пустую вкладку вместо ошибки чтения файла.
  if (props.startup === null) {
    ensureWorkspace();
    return;
  }

  stopWorkspace = await startWorkspace();

  // Шаблоны нужны пустой вкладке и настройкам сразу, а ошибка чтения не
  // должна задерживать показ оболочки: причина уйдёт в журнал сама.
  void loadTemplates();
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
  stopWorkspace?.();
});
</script>

<template>
  <div class="workbench">
    <Sidebar :tools="tools" :collapsed="collapsed" @toggle="toggleSidebar" />

    <div class="workbench__main">
      <TabStrip />
      <WorkspaceView :tools="tools" :startup="startup" />
    </div>
  </div>
</template>

<style scoped>
.workbench {
  /* Ширины сайдбара — токены оболочки: компоненты ниже читают их как
     унаследованные переменные и не дублируют числа. */
  --ag-sidebar-width: 240px;
  --ag-rail-width: 64px;
  /* Плитка шапки сайдбара: знак и переключатель одного размера. */
  --ag-tile-size: 32px;
  /* Потолок контента: каталог уже форм, настройки — двухколоночный экран.
     Строки читаются, а не растягиваются на всю ширину окна. */
  --ag-content-catalog: 960px;
  --ag-content-settings: 1120px;

  display: flex;
  height: 100%;
  min-height: 0;
  background: var(--ag-bg);
  color: var(--p-text-color);
}

.workbench__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
</style>

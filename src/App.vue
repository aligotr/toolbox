<script setup lang="ts">
// Оболочка приложения.
//
// Её задача — быть «рамкой»: боковое меню строится из реестра модулей
// (`src/modules/index.ts`), рабочая область показывает выбранный компонент.
// Оболочка ничего не знает о конкретных подсистемах, поэтому расширение
// приложения не требует правок этого файла.

import { computed, ref } from "vue";
import { sortedModules } from "./core/modules";
import { uiModules } from "./modules";

const modules = sortedModules(uiModules);
const activeId = ref(modules[0]?.id ?? "");
const activeModule = computed(() => modules.find((item) => item.id === activeId.value));
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand__mark">TB</span>
        <div>
          <strong>ToolBox</strong>
          <small>рабочий набор</small>
        </div>
      </div>

      <nav class="nav">
        <button
          v-for="item in modules"
          :key="item.id"
          class="nav__item"
          :class="{ 'nav__item--active': item.id === activeId }"
          @click="activeId = item.id"
        >
          <span class="nav__icon">{{ item.icon ?? "•" }}</span>
          <span class="nav__title">{{ item.title }}</span>
        </button>
      </nav>

      <div class="sidebar__footer">
        <span class="dot" />
        <span>ядро запущено</span>
      </div>
    </aside>

    <main class="content">
      <header class="content__bar">
        <span class="content__title">{{ activeModule?.title ?? "ToolBox" }}</span>
        <span class="content__hint">{{ activeModule?.description ?? "" }}</span>
      </header>

      <div class="content__body">
        <component :is="activeModule?.component" v-if="activeModule" />
        <p v-else class="empty">Модули не зарегистрированы.</p>
      </div>
    </main>
  </div>
</template>

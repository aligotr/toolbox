<script setup lang="ts">
// Оболочка приложения.
//
// Её задача — быть «рамкой»: боковое меню строится из реестра модулей
// (`src/modules/index.ts`), рабочая область показывает выбранный компонент.
// Оболочка ничего не знает о конкретных подсистемах, поэтому расширение
// приложения не требует правок этого файла.
//
// Отдельная обязанность оболочки — блокирующий экран: если писать в папку
// программы нельзя, модули не запускаются, и пользователь должен увидеть
// причину, а не пустое окно (ADR 0005).

import { invoke } from "@tauri-apps/api/core";
import { computed, onMounted, onUnmounted, ref } from "vue";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { subscribeEvent } from "./core/bus";
import { write } from "./core/journal";
import { sortedModules } from "./core/modules";
import { loadStartupStatus, type StartupStatus } from "./core/startup";
import { uiModules } from "./modules";

const modules = sortedModules(uiModules);
const activeId = ref(modules[0]?.id ?? "");
const activeModule = computed(() => modules.find((item) => item.id === activeId.value));

/**
 * Отказ шины, о котором иначе не узнать: паника обработчика, потеря данных
 * при сериализации, недоставка в интерфейс (ADR 0008). Приходит событием
 * `core:error` и сразу попадает в журнал, какой бы экран ни был открыт.
 */
interface BusError {
  source: string;
  text: string;
}

const startup = ref<StartupStatus | null>(null);
const ready = ref(false);

let unlistenError: UnlistenFn | null = null;

/** Выход без шины: на заблокированном старте модули не зарегистрированы. */
async function exitApp() {
  try {
    await invoke("exit_app");
  } catch {
    // Окно всё равно закроется штатным способом; сообщать некуда.
  }
}

onMounted(async () => {
  // Проверка записи в папку программы выполняется до старта шины.
  startup.value = await loadStartupStatus();
  ready.value = true;

  if (startup.value?.blocked) return;

  unlistenError = await subscribeEvent<BusError>("core:error", (payload) => {
    write(payload.source, "error", payload.text);
  });
});

onUnmounted(() => {
  unlistenError?.();
});
</script>

<template>
  <div v-if="startup?.blocked" class="blocked">
    <section class="blocked__card">
      <span class="blocked__mark">!</span>
      <h1>{{ startup.title ?? "Не могу начать работу" }}</h1>
      <p class="blocked__lead">
        ToolBox хранит настройки и лог рядом с исполняемым файлом — в этом смысл
        переносимости. Без записи приложение не работает правильно, поэтому
        модули не запущены.
      </p>

      <dl class="blocked__facts">
        <div>
          <dt>Папка программы</dt>
          <dd class="mono">{{ startup.root }}</dd>
        </div>
        <div>
          <dt>Что именно не удалось</dt>
          <dd>{{ startup.reason }}</dd>
        </div>
      </dl>

      <div class="blocked__hint">
        <p>Что сделать:</p>
        <ul>
          <li>перенесите папку с программой в доступное место — например, в «Документы»;</li>
          <li>или снимите атрибут «только чтение» и проверьте права на папку.</li>
        </ul>
      </div>

      <button class="btn btn--danger" @click="exitApp">Выйти</button>
    </section>
  </div>

  <div v-else-if="!ready" class="blocked" />

  <div v-else class="shell">
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

<style scoped>
/* Блокирующий экран: одна карточка по центру окна.
   Оформление намеренно спокойное — это объяснение, а не аварийная тревога. */
.blocked {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 32px;
}

.blocked__card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 620px;
  padding: 32px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface);
}

.blocked__mark {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(224, 93, 93, 0.12);
  color: #ff9b9b;
  font-size: 20px;
  font-weight: 700;
}

.blocked__card h1 {
  margin: 0;
  font-size: 28px;
  line-height: 1.25;
}

.blocked__lead {
  margin: 0;
  color: var(--text-muted);
  font-size: 15px;
  line-height: 1.55;
}

.blocked__facts {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 16px;
  border-radius: 10px;
  background: var(--surface-2);
}

.blocked__facts div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.blocked__facts dt {
  color: var(--text-muted);
  font-size: 13px;
}

.blocked__facts dd {
  margin: 0;
  font-size: 14px;
  overflow-wrap: anywhere;
}

.blocked__hint p {
  margin: 0 0 8px;
  font-size: 14px;
}

.blocked__hint ul {
  margin: 0;
  padding-left: 20px;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.55;
}

.blocked__card .btn {
  align-self: flex-start;
}

.mono {
  font-family: var(--font-mono);
  font-size: 13px;
}
</style>

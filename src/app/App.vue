<script setup lang="ts">
// Точка сборки интерфейса.
//
// Здесь проверяется, можно ли начинать работу, и только потом показывается
// оболочка. Блокирующий экран — обязанность приложения, а не сайдбара:
// если писать в папку программы нельзя, модули не запущены, и пользователь
// должен увидеть причину, а не пустое окно (ADR 0005).
//
// Оболочка получает инструменты готовым списком. Импортов из `tools/*`
// в `shell` нет: связывает их только этот файл (ADR 0012).

import { invoke } from "@tauri-apps/api/core";
import { onMounted, onUnmounted, ref } from "vue";
import type { UnlistenFn } from "@tauri-apps/api/event";
import Button from "primevue/button";
import ConfirmDialog from "primevue/confirmdialog";
import { subscribeEvent } from "../core/bus";
import { write } from "../core/journal";
import { loadSettings, startSettingsSync } from "../core/settings";
import { loadStartupStatus, type StartupStatus } from "../core/startup";
import AppShell from "../shell/AppShell.vue";
import { tools } from "./tools";

/**
 * Отказ шины, о котором иначе не узнать: паника обработчика, потеря данных
 * при сериализации, недоставка в интерфейс (ADR 0008). Приходит событием
 * `core:error` и попадает в журнал, какой бы экран ни был открыт.
 */
interface BusError {
  source: string;
  text: string;
}

const startup = ref<StartupStatus | null>(null);
const ready = ref(false);

let unlistenError: UnlistenFn | null = null;
let unlistenSettings: UnlistenFn | null = null;

/** Выход без шины: на заблокированном старте модули не зарегистрированы. */
async function exitApp(): Promise<void> {
  try {
    await invoke("exit_app");
  } catch {
    // Окно всё равно закроется штатным способом; сообщать некуда.
  }
}

onMounted(async () => {
  // Проверка записи в папку программы выполняется до запуска оболочки.
  startup.value = await loadStartupStatus();

  // Настройки нужны до первого кадра: от них зависит ширина сайдбара.
  // Без ядра (отладка одной страницы) читать нечего.
  if (startup.value && !startup.value.blocked) {
    await loadSettings();
  }

  ready.value = true;

  if (startup.value?.blocked || startup.value === null) return;

  unlistenError = await subscribeEvent<BusError>("core:error", (payload) => {
    write(payload.source, "error", payload.text);
  });
  unlistenSettings = await startSettingsSync();
});

onUnmounted(() => {
  unlistenError?.();
  unlistenSettings?.();
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

      <Button class="blocked__exit" label="Выйти" severity="danger" @click="exitApp" />
    </section>
  </div>

  <div v-else-if="!ready" class="blocked" />

  <AppShell v-else :tools="tools" :startup="startup" />

  <ConfirmDialog />
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
  max-width: 640px;
  padding: 32px;
  border: 1px solid var(--p-surface-700);
  border-radius: 16px;
  background: var(--p-surface-900);
}

.blocked__mark {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--p-red-500) 16%, transparent);
  color: var(--p-red-300);
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
  color: var(--p-text-muted-color);
  font-size: 15px;
  line-height: 1.55;
}

.blocked__facts {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 0;
  padding: 16px;
  border-radius: 8px;
  background: var(--p-surface-950);
}

.blocked__facts div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.blocked__facts dt {
  color: var(--p-text-muted-color);
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
  color: var(--p-text-muted-color);
  font-size: 14px;
  line-height: 1.55;
}

.blocked__exit {
  align-self: flex-start;
}

.mono {
  font-family: var(--ag-font-mono);
  font-size: 13px;
}
</style>

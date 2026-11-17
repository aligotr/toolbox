<script setup lang="ts">
// Точка сборки интерфейса.
//
// Здесь проверяется, можно ли начинать работу, и только потом показывается
// оболочка. Блокирующий экран — обязанность приложения, а не сайдбара:
// если писать в папку программы нельзя, модули не запущены, и пользователь
// должен увидеть причину, а не пустое окно (ADR 0005).
//
// Оболочка получает инструменты готовым списком. Импортов из `tools/*`
// в `workbench` нет: связывает их только этот файл (ADR 0012).

import { invoke } from "@tauri-apps/api/core";
import { onMounted, onUnmounted, ref } from "vue";
import type { UnlistenFn } from "@tauri-apps/api/event";
import Button from "primevue/button";
import ConfirmDialog from "primevue/confirmdialog";
import { subscribeEvent } from "@/core/infra/bus";
import type { AppError } from "@/contracts/errors";
import { describeError } from "@/core/infra/errors";
import { t } from "@/core/infra/i18n";
import { write } from "@/core/infra/journal";
import { loadSettings, startSettingsSync } from "@/core/services/settings/index";
import { loadStartupStatus, type StartupStatus } from "@/core/services/startup";
import WorkbenchView from "@/workbench/WorkbenchView.vue";
import { tools } from "./tools";

/**
 * Отказ шины, о котором иначе не узнать: паника обработчика, потеря данных
 * при сериализации, недоставка в интерфейс (ADR 0008). Приходит событием
 * `core:error` и попадает в журнал, какой бы экран ни был открыт.
 */
interface BusError {
  source: string;
  error: AppError;
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
    write(payload.source, "error", "journal.app.busError", {
      reason: payload.error,
    });
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
      <header class="blocked__head">
        <span class="blocked__mark">!</span>
        <h1>{{ startup.title ? t(startup.title) : t("startup.title") }}</h1>
      </header>
      <p class="blocked__lead">{{ t("startup.lead") }}</p>

      <dl class="blocked__facts">
        <div>
          <dt>{{ t("startup.folder") }}</dt>
          <dd class="mono">{{ startup.root }}</dd>
        </div>
        <div>
          <dt>{{ t("startup.reason") }}</dt>
          <dd>{{ startup.reason ? describeError(startup.reason) : "" }}</dd>
        </div>
      </dl>

      <div class="blocked__hint">
        <p>{{ t("startup.hint") }}</p>
        <ul>
          <li>{{ t("startup.move") }}</li>
          <li>{{ t("startup.permissions") }}</li>
        </ul>
      </div>

      <Button
        class="blocked__exit"
        :label="t('startup.exit')"
        severity="secondary"
        @click="exitApp"
      />
    </section>
  </div>

  <div v-else-if="!ready" class="blocked" />

  <WorkbenchView v-else :tools="tools" :startup="startup" />

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
  padding: var(--ag-space-2xl);
}

.blocked__card {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-lg);
  max-width: 640px;
  padding: var(--ag-space-2xl);
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-lg);
  background: var(--ag-surface);
}

.blocked__head {
  display: flex;
  align-items: center;
  gap: var(--ag-space-md);
}

.blocked__mark {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: var(--ag-radius-round);
  background: color-mix(in srgb, var(--ag-danger) 12%, transparent);
  color: var(--ag-danger);
  font-size: 20px;
  font-weight: 700;
}

.blocked__card h1 {
  min-width: 0;
  margin: 0;
  font-size: var(--ag-text-xl);
  line-height: 1.25;
}

.blocked__lead {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-md);
  line-height: 1.55;
}

.blocked__facts {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-lg);
  margin: 0;
  padding: var(--ag-space-lg);
  border-radius: var(--ag-radius-md);
  background: var(--ag-surface-2);
}

.blocked__facts div {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-xs);
}

.blocked__facts dt {
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.blocked__facts dd {
  margin: 0;
  font-size: var(--ag-text-sm);
  overflow-wrap: anywhere;
}

.blocked__hint p {
  margin: 0 0 var(--ag-space-sm);
  font-size: var(--ag-text-sm);
}

.blocked__hint ul {
  margin: 0;
  padding-left: 20px;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-sm);
  line-height: 1.55;
}

.blocked__exit {
  align-self: flex-end;
}

.mono {
  font-family: var(--ag-font-mono);
  font-size: var(--ag-text-xs);
}
</style>

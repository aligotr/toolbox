<script setup lang="ts">
// Раздел «Журнал»: уровень файлового лога и уход за файлами.
//
// Файловый лог отвечает ровно на один вопрос — почему приложение или функция
// не сработали. Работа инструментов сюда не попадает: для неё есть журнал
// интерфейса. Поэтому в разделе нет ни просмотра записей, ни фильтров.

import Button from "primevue/button";
import Select from "primevue/select";
import { useConfirm } from "primevue/useconfirm";
import { computed, onMounted, ref } from "vue";
import type { LogLevel } from "@/contracts/settings";
import {
  appInfo,
  loadAppInfo,
  openFolder,
  status as appStatus,
} from "@/core/services/appInfo";
import { CONFIRM_CALM_REJECT, CONFIRM_DANGER_ACCEPT } from "@/core/constants";
import { pruneLogs, status as dataStatus } from "@/core/services/data";
import { loadSettings, logLevel, setLogLevel, settings, status } from "@/core/services/settings/index";
import { LOG_LEVEL_OPTIONS } from "./constants";

const confirm = useConfirm();

/** Выбранный уровень: запись уходит в ядро сразу. */
const level = computed<LogLevel>({
  get: () => logLevel.value,
  set: (value) => void setLogLevel(value),
});

/** Пояснение к выбранному уровню: что именно попадёт в файл. */
const levelHint = computed(
  () => LOG_LEVEL_OPTIONS.find((option) => option.value === logLevel.value)?.hint ?? "",
);

/** Сколько файлов удалила последняя очистка; `null` — ещё не запускали. */
const pruned = ref<number | null>(null);

/** Срок хранения приходит из ядра, чтобы подпись и действие не разошлись. */
const keepDays = computed(() => appInfo.current?.log_keep_days ?? null);

function requestPrune(): void {
  if (keepDays.value === null) return;

  confirm.require({
    header: "Очистка логов",
    message:
      `Файлы лога старше ${keepDays.value} дней будут удалены. ` +
      "Свежие записи останутся: по ним ещё можно разбирать поломки.",
    acceptLabel: "Очистить",
    rejectLabel: "Отмена",
    acceptProps: CONFIRM_DANGER_ACCEPT,
    rejectProps: CONFIRM_CALM_REJECT,
    accept: async () => {
      const removed = await pruneLogs();
      if (removed !== null) pruned.value = removed;
    },
  });
}

onMounted(() => {
  void loadSettings();
  void loadAppInfo();
});
</script>

<template>
  <section class="log wb-section">
    <header class="wb-section__head">
      <h2 class="wb-section__title">Журнал</h2>
      <p class="wb-section__lead">
        Файл лога нужен для разбора: почему приложение или функция не сработали.
        Уровень меняется без перезапуска. Работа инструментов пишется в журнал
        интерфейса, а не сюда.
      </p>
    </header>

    <div class="log__field">
      <label class="log__label" for="log-level">Уровень записи</label>
      <Select
        v-model="level"
        input-id="log-level"
        class="log__select"
        :options="LOG_LEVEL_OPTIONS"
        option-label="label"
        option-value="value"
        :loading="status.load.loading"
        :disabled="status.load.loading || !settings.loaded"
      />
      <p class="log__hint">{{ levelHint }}</p>
      <p v-if="status.log.error" class="log__error">{{ status.log.error }}</p>
    </div>

    <dl class="log__facts">
      <div class="log__fact">
        <dt>Текущий файл</dt>
        <dd v-if="appInfo.current?.log_path" class="mono">
          {{ appInfo.current.log_path }}
        </dd>
        <dd v-else class="log__muted">Лог не запущен.</dd>
      </div>
      <div class="log__fact">
        <dt>Папка логов</dt>
        <dd v-if="appInfo.current?.log_dir" class="mono">
          {{ appInfo.current.log_dir }}
        </dd>
        <dd v-else class="log__muted">Папка неизвестна.</dd>
      </div>
    </dl>

    <div class="log__actions">
      <Button
        label="Открыть папку логов"
        icon="pi pi-folder-open"
        size="small"
        severity="secondary"
        outlined
        :loading="appStatus.folder.loading"
        :disabled="!appInfo.current?.log_dir"
        @click="openFolder('logs')"
      />
      <Button
        :label="
          keepDays === null
            ? 'Очистить старые логи'
            : `Очистить логи старше ${keepDays} дней`
        "
        icon="pi pi-trash"
        size="small"
        severity="secondary"
        text
        :loading="dataStatus.prune.loading"
        :disabled="keepDays === null"
        @click="requestPrune"
      />
    </div>

    <p v-if="pruned !== null" class="log__result">
      Удалено файлов: {{ pruned }}. Свежие записи на месте.
    </p>

    <p v-if="appStatus.load.error" class="log__error">{{ appStatus.load.error }}</p>
    <p v-if="appStatus.folder.error" class="log__error">
      {{ appStatus.folder.error }}
    </p>
    <p v-if="dataStatus.prune.error" class="log__error">
      {{ dataStatus.prune.error }}
    </p>
  </section>
</template>

<style scoped>
.log__field {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-sm);
  padding: var(--ag-space-lg);
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-md);
  background: var(--ag-surface);
}

.log__label {
  font-size: var(--ag-text-sm);
  font-weight: 600;
}

.log__select {
  width: 100%;
  max-width: 320px;
}

.log__hint {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.log__facts {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-lg);
  margin: 0;
}

.log__fact {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-xs);
  padding: var(--ag-space-lg);
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-md);
  background: var(--ag-surface);
}

.log__fact dt {
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.log__fact dd {
  margin: 0;
  font-size: var(--ag-text-sm);
  overflow-wrap: anywhere;
}

.log__muted {
  color: var(--p-text-muted-color);
}

.log__actions {
  display: flex;
  align-items: center;
  gap: var(--ag-space-sm);
  flex-wrap: wrap;
}

.log__result {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-sm);
}

.log__error {
  margin: 0;
  color: var(--ag-danger);
  font-size: var(--ag-text-xs);
  line-height: 1.45;
}

.mono {
  font-family: var(--ag-font-mono);
  font-size: var(--ag-text-xs);
}
</style>

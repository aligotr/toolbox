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
import type { LogLevel } from "../../contracts/settings";
import {
  appInfo,
  loadAppInfo,
  openFolder,
  status as appStatus,
} from "../../core/appInfo";
import { pruneLogs, status as dataStatus } from "../../core/data";
import { loadSettings, logLevel, setLogLevel, settings, status } from "../../core/settings";
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
  <section class="log">
    <header class="log__head">
      <h2 class="log__title">Журнал</h2>
      <p class="log__lead">
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
.log {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.log__head {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.log__lead {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 14px;
  line-height: 1.5;
}

.log__field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border: 1px solid var(--p-surface-700);
  border-radius: 8px;
  background: var(--p-surface-900);
}

.log__label {
  font-size: 14px;
  font-weight: 600;
}

.log__select {
  width: 100%;
  max-width: 320px;
}

.log__hint {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 13px;
}

.log__facts {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 0;
}

.log__fact {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px;
  border: 1px solid var(--p-surface-700);
  border-radius: 8px;
  background: var(--p-surface-900);
}

.log__fact dt {
  color: var(--p-text-muted-color);
  font-size: 13px;
}

.log__fact dd {
  margin: 0;
  font-size: 14px;
  overflow-wrap: anywhere;
}

.log__muted {
  color: var(--p-text-muted-color);
}

.log__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.log__result {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 14px;
}

.log__error {
  margin: 0;
  color: var(--p-red-300);
  font-size: 13px;
  line-height: 1.45;
}

.mono {
  font-family: var(--ag-font-mono);
  font-size: 13px;
}
</style>

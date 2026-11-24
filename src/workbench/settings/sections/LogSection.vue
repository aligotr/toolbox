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
import { appInfo, loadAppInfo, openFolder, status as appStatus } from "@/core/services/appInfo";
import { t } from "@/core/infra/i18n";
import { pruneLogs, status as logsStatus } from "@/core/services/logs";
import {
  loadSettings,
  logLevel,
  setLogLevel,
  settings,
  status,
} from "@/core/services/settings/index";
import { requireConfirm } from "@/ui/primevue/popup/confirmPopup";
import { logLevelOptions } from "../logLevels";

const confirm = useConfirm();

/** Выбранный уровень: запись уходит в ядро сразу. */
const level = computed<LogLevel>({
  get: () => logLevel.value,
  set: (value) => void setLogLevel(value),
});

/** Список уровней; подписи берутся из словаря при смене языка. */
const levelOptions = computed(() => logLevelOptions());

/** Пояснение к выбранному уровню: что именно попадёт в файл. */
const levelHint = computed(
  () => levelOptions.value.find((option) => option.value === logLevel.value)?.hint ?? "",
);

/** Сколько файлов удалила последняя очистка; `null` — ещё не запускали. */
const pruned = ref<number | null>(null);

/** Срок хранения приходит из ядра, чтобы подпись и действие не разошлись. */
const keepDays = computed(() => appInfo.current?.log_keep_days ?? null);

function requestPrune(event: MouseEvent): void {
  if (keepDays.value === null) return;

  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return;

  requireConfirm(confirm, {
    target,
    message: t("settings.log.pruneMessage", { count: keepDays.value }),
    acceptLabel: t("common.clear"),
    rejectLabel: t("common.cancel"),
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
      <h2 class="wb-section__title">{{ t("common.journal") }}</h2>
      <p class="wb-section__lead">{{ t("settings.log.lead") }}</p>
    </header>

    <div class="log__field">
      <div class="log__label-line">
        <label class="log__label" for="log-level">{{ t("settings.log.level") }}</label>
        <span class="log__hint">{{ levelHint }}</span>
      </div>
      <Select
        v-model="level"
        input-id="log-level"
        class="log__select"
        :options="levelOptions"
        option-label="label"
        option-value="value"
        :loading="status.load.loading"
        :disabled="status.load.loading || !settings.loaded"
      />
      <p v-if="status.log.error" class="log__error">{{ status.log.error }}</p>
    </div>

    <dl class="log__facts">
      <div class="log__fact">
        <dt>{{ t("settings.log.currentFile") }}</dt>
        <dd v-if="appInfo.current?.log_path" class="mono">
          {{ appInfo.current.log_path }}
        </dd>
        <dd v-else class="log__muted">{{ t("settings.log.notStarted") }}</dd>
      </div>
      <div class="log__fact">
        <dt>{{ t("settings.log.folder") }}</dt>
        <dd v-if="appInfo.current?.log_dir" class="mono">
          {{ appInfo.current.log_dir }}
        </dd>
        <dd v-else class="log__muted">{{ t("settings.log.folderUnknown") }}</dd>
      </div>
    </dl>

    <div class="log__actions">
      <Button
        :label="t('settings.log.openFolder')"
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
            ? t('settings.log.prune')
            : t('settings.log.pruneOlder', { count: keepDays })
        "
        icon="pi pi-trash"
        size="small"
        severity="secondary"
        text
        :loading="logsStatus.prune.loading"
        :disabled="keepDays === null"
        @click="requestPrune"
      />
    </div>

    <p v-if="pruned !== null" class="log__result">
      {{ t("settings.log.pruned", { count: pruned }) }}
    </p>

    <p v-if="appStatus.load.error" class="log__error">{{ appStatus.load.error }}</p>
    <p v-if="appStatus.folder.error" class="log__error">
      {{ appStatus.folder.error }}
    </p>
    <p v-if="logsStatus.prune.error" class="log__error">
      {{ logsStatus.prune.error }}
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

.log__label-line {
  display: flex;
  align-items: baseline;
  gap: var(--ag-space-sm);
  flex-wrap: wrap;
}

.log__label {
  font-size: var(--ag-text-sm);
  font-weight: 600;
}

/* Пояснение уровня идёт за заголовком через точку-разделитель: это
   справка о выбранном уровне, а не часть подписи поля. */
.log__hint {
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.log__hint::before {
  margin-right: var(--ag-space-sm);
  content: "•";
}

.log__select {
  width: 100%;
  max-width: 320px;
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

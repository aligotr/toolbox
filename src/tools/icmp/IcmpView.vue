<script setup lang="ts">
// Экран инструмента Ping.
//
// Один экран на все случаи: одиночная проверка - это таблица из одной цели,
// список - та же таблица с фильтрами. Цели и пакеты живут в сеансе
// по `cellKey`, поэтому переключение вкладок их не теряет.
//
// Здесь только разметка и короткие обработчики: запуск, фильтры, параметры
// и журнал - в `useIcmp`, транспорт - в `api.ts`. Запуск начинает кнопка,
// а не добавление цели: проверка тратит пакеты.

import Button from "primevue/button";
import InputGroup from "primevue/inputgroup";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import { useConfirm } from "primevue/useconfirm";
import { computed, onMounted, ref, watch } from "vue";
import type { ToolCellProps } from "@/contracts/tools";
import { describeError } from "@/core/infra/errors";
import { t } from "@/core/infra/i18n";
import { requireConfirm } from "@/ui/primevue/popup/confirmPopup";
import ToolNumberField from "@/ui/tool/ToolNumberField.vue";
import ToolScreen from "@/ui/tool/ToolScreen.vue";
import {
  familyFilterOptions,
  familyOptions,
  MAX_COUNT,
  MAX_PERIOD_MS,
  MAX_TIMEOUT_MS,
  MIN_COUNT,
  MIN_PERIOD_MS,
  MIN_TIMEOUT_MS,
  STANDALONE_CELL_KEY,
  statusFilterOptions,
} from "./constants";
import { applyDefaultPreset } from "./presets";
import PresetBar from "./components/PresetBar.vue";
import PresetsDialog from "./components/PresetsDialog.vue";
import TargetTable from "./components/TargetTable.vue";
import { useIcmp } from "./useIcmp";
import "./styles.css";

const props = defineProps<ToolCellProps>();
const confirm = useConfirm();

const {
  session,
  running,
  visibleTargets,
  canRun,
  periodInvalid,
  countInvalid,
  timeoutInvalid,
  addTarget,
  runAll,
  runTarget,
  cancel,
  clear,
  removeTarget,
  moveTarget,
  exportSummary,
  exportPackets,
} = useIcmp(props);

const draft = ref("");
const addError = ref<string | null>(null);
const addBox = ref<HTMLElement | null>(null);
const presetsOpen = ref(false);
const presetNote = ref<string | null>(null);
const exportNote = ref<string | null>(null);

/** Правка цели снимает прошлую ошибку добавления: сообщение не висит зря. */
watch(draft, () => {
  addError.value = null;
});

// Новая вкладка открывается с пресетом по умолчанию. Признак свежести ячейки
// гасится внутри загрузки, поэтому повторный показ вкладки пресет не тронет.
onMounted(() => {
  void applyDefaultPreset(session, props.cellKey ?? STANDALONE_CELL_KEY);
});

/** Сообщения о состоянии данных: причина отказа или заметка о пресете. */
interface DataNotice {
  source: "run" | "preset";
  text: string;
  urgent: boolean;
}

const notices = computed<DataNotice[]>(() => {
  const list: DataNotice[] = [];
  if (session.status.run.error) {
    list.push({ source: "run", text: session.status.run.error, urgent: true });
  }
  if (presetNote.value) {
    list.push({ source: "preset", text: presetNote.value, urgent: false });
  }
  return list;
});

/** Параметры до правки: Escape возвращает сохранённое значение. */
let paramsSnapshot: { periodMs: number; count: number; timeoutMs: number } | null = null;

function rememberParams(): void {
  if (running.value || paramsSnapshot !== null) return;
  paramsSnapshot = {
    periodMs: session.periodMs,
    count: session.count,
    timeoutMs: session.timeoutMs,
  };
}

function forgetParamsSnapshot(): void {
  paramsSnapshot = null;
}

/** Пресет заменил вход: прошлая заметка о быстрых действиях больше не нужна. */
function forgetPresetNote(): void {
  presetNote.value = null;
  forgetParamsSnapshot();
}

/** Снимок живёт, пока фокус внутри блока параметров. */
function forgetParams(event: FocusEvent): void {
  const box = event.currentTarget as HTMLElement | null;
  const next = event.relatedTarget as Node | null;
  if (box && next && box.contains(next)) return;
  paramsSnapshot = null;
}

function restoreParams(): void {
  if (!paramsSnapshot || running.value) return;
  session.periodMs = paramsSnapshot.periodMs;
  session.count = paramsSnapshot.count;
  session.timeoutMs = paramsSnapshot.timeoutMs;
}

function focusInput(): void {
  addBox.value?.querySelector<HTMLInputElement>("input")?.focus();
}

/** Добавляет цель; запуск остаётся за кнопкой. */
function submitTarget(): void {
  if (running.value) return;

  const result = addTarget(draft.value, session.family);
  if (result.kind === "error") {
    addError.value = result.message;
    return;
  }

  addError.value = null;
  draft.value = "";
  focusInput();
}

/** Запуск и остановка - одно действие: во время проверки кнопка отменяет. */
function toggleRun(): void {
  if (running.value) {
    cancel();
  } else {
    paramsSnapshot = null;
    runAll();
  }
}

/** Запуск с клавиатуры из блока параметров: снимок правки больше не нужен. */
function runFromParams(): void {
  if (running.value) return;
  paramsSnapshot = null;
  runAll();
}

/** Спрашивает подтверждение очистки всплывающим блоком у кнопки. */
function requestClear(event: MouseEvent): void {
  requireConfirm(confirm, {
    target: event.currentTarget as HTMLElement,
    message: t("icmp.view.clearMessage"),
    acceptLabel: t("icmp.view.clearAccept"),
    rejectLabel: t("icmp.view.cancel"),
    accept: () => {
      void clear();
    },
  });
}

/** Общая часть выгрузки: заметка о способе и числе строк. */
async function saveExport(
  action: () => Promise<{ method: "download" | "clipboard"; copied: boolean; rows: number }>,
): Promise<void> {
  exportNote.value = null;
  try {
    const result = await action();
    exportNote.value =
      result.method === "clipboard"
        ? t("icmp.view.exportClipboard", { count: result.rows })
        : result.copied
          ? t("icmp.view.exportWithCopy", { count: result.rows })
          : t("icmp.view.exportDone", { count: result.rows });
  } catch (error) {
    exportNote.value = t("icmp.view.exportFailed", { reason: describeError(error) });
  }
}
</script>

<template>
  <ToolScreen class="icmp">
    <template #preset>
      <PresetBar :session="session" @open="presetsOpen = true" @note="presetNote = $event" />
    </template>

    <div class="tool__toolbar">
      <div ref="addBox" class="tool__add">
        <InputGroup>
          <InputText
            v-model="draft"
            size="small"
            :class="{ 'p-invalid': addError }"
            :placeholder="addError ?? t('icmp.view.targetPlaceholder')"
            :aria-invalid="addError !== null"
            :aria-label="t('icmp.view.targetAria')"
            :disabled="running"
            @keyup.enter="submitTarget"
          />
          <Select
            v-model="session.family"
            size="small"
            :options="familyOptions()"
            option-label="label"
            option-value="value"
            :aria-label="t('icmp.view.familyAria')"
            :disabled="running"
          />
          <Button
            v-tooltip.top="t('icmp.view.addHint')"
            icon="pi pi-plus"
            severity="secondary"
            outlined
            size="small"
            :aria-label="t('icmp.view.addHint')"
            :disabled="running"
            @click="submitTarget"
          />
        </InputGroup>
      </div>

      <div
        class="tool__params"
        @focusin="rememberParams"
        @focusout="forgetParams"
        @keyup.enter="runFromParams"
        @keyup.escape="restoreParams"
      >
        <ToolNumberField
          id="icmp-period"
          v-model="session.periodMs"
          :label="t('icmp.view.period')"
          :min="MIN_PERIOD_MS"
          :max="MAX_PERIOD_MS"
          :step="100"
          :unit="t('icmp.view.ms')"
          :invalid="periodInvalid"
          :disabled="running"
        />
        <ToolNumberField
          id="icmp-count"
          v-model="session.count"
          :label="t('icmp.view.count')"
          :min="MIN_COUNT"
          :max="MAX_COUNT"
          :step="1"
          unit=""
          :invalid="countInvalid"
          :disabled="running"
        />
        <ToolNumberField
          id="icmp-timeout"
          v-model="session.timeoutMs"
          :label="t('icmp.view.timeout')"
          :min="MIN_TIMEOUT_MS"
          :max="MAX_TIMEOUT_MS"
          :step="100"
          :unit="t('icmp.view.ms')"
          :invalid="timeoutInvalid"
          :disabled="running"
        />
        <Button
          class="tool__run"
          :label="running ? t('icmp.view.stop') : t('icmp.view.run')"
          :icon="running ? 'pi pi-stop' : 'pi pi-play'"
          :severity="running ? 'contrast' : undefined"
          size="small"
          :disabled="!running && !canRun"
          @click="toggleRun"
        />
      </div>
    </div>

    <div class="tool__filters">
      <InputText
        v-model="session.filters.search"
        class="tool__search"
        size="small"
        :placeholder="t('icmp.view.search')"
        :aria-label="t('icmp.view.search')"
      />
      <Select
        v-model="session.filters.status"
        :options="statusFilterOptions()"
        option-label="label"
        option-value="value"
        class="tool__filter-select"
        size="small"
        :aria-label="t('icmp.view.statusFilter')"
      />
      <Select
        v-model="session.filters.family"
        :options="familyFilterOptions()"
        option-label="label"
        option-value="value"
        class="tool__filter-select"
        size="small"
        :aria-label="t('icmp.view.familyFilter')"
      />

      <div class="tool__table-actions">
        <Button
          v-tooltip.bottom="t('icmp.view.exportSummary')"
          icon="pi pi-download"
          severity="secondary"
          text
          size="small"
          :aria-label="t('icmp.view.exportSummary')"
          :disabled="visibleTargets.length === 0"
          @click="saveExport(exportSummary)"
        />
        <Button
          v-tooltip.bottom="t('icmp.view.exportPackets')"
          icon="pi pi-list"
          severity="secondary"
          text
          size="small"
          :aria-label="t('icmp.view.exportPackets')"
          :disabled="visibleTargets.length === 0"
          @click="saveExport(exportPackets)"
        />
        <Button
          v-tooltip.bottom="t('icmp.view.clear')"
          icon="pi pi-trash"
          severity="danger"
          text
          size="small"
          :aria-label="t('icmp.view.clear')"
          :disabled="session.targets.length === 0 && !session.status.run.error"
          @click="requestClear"
        />
      </div>
    </div>

    <TargetTable
      :targets="visibleTargets"
      :total-targets="session.targets.length"
      :highlight-target-id="session.highlightTargetId"
      :busy="running"
      @repeat="runTarget"
      @delete="removeTarget"
      @reorder="moveTarget"
    >
      <template #notice>
        <div v-if="notices.length > 0" class="tool-table__notices">
          <p
            v-for="notice in notices"
            :key="notice.source"
            class="tool-table__notice"
            :role="notice.urgent ? 'alert' : undefined"
            :aria-live="notice.urgent ? undefined : 'polite'"
          >
            <i class="pi pi-exclamation-circle" aria-hidden="true" />
            <span>{{ notice.text }}</span>
          </p>
        </div>
      </template>
    </TargetTable>

    <p v-if="session.progress.targets > 0" class="icmp__status" aria-live="polite">
      {{
        t("icmp.view.progress", {
          targets: session.progress.targets,
          addresses: session.progress.addresses,
          sent: session.progress.sent,
          received: session.progress.received,
        })
      }}
    </p>

    <p v-if="exportNote" class="tool__hint" aria-live="polite">
      <i class="pi pi-file" aria-hidden="true" />
      {{ exportNote }}
    </p>

    <template #overlays>
      <PresetsDialog v-model:visible="presetsOpen" :session="session" @applied="forgetPresetNote" />
    </template>
  </ToolScreen>
</template>

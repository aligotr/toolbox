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
import Checkbox from "primevue/checkbox";
import InputText from "primevue/inputtext";
import Popover from "primevue/popover";
import Select from "primevue/select";
import { computed, onMounted, ref } from "vue";
import type { ToolCellProps } from "@/contracts/tools";
import { catalog, formatNumber, t } from "@/core/infra/i18n";
import { anchorOverlay } from "@/ui/primevue/popup/anchoredOverlay";
import ToolNumberField from "@/ui/tool/ToolNumberField.vue";
import ToolScreen from "@/ui/tool/ToolScreen.vue";
import {
  familyFilterOptions,
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
  removeTarget,
  moveTarget,
} = useIcmp(props);

const presetsOpen = ref(false);
const presetNote = ref<string | null>(null);
const paramsMenu = ref<InstanceType<typeof Popover> | null>(null);
const table = ref<InstanceType<typeof TargetTable> | null>(null);

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

/** Параметры до правки: отмена в поповере возвращает сохранённое значение. */
let paramsSnapshot: {
  periodMs: number;
  count: number;
  endless: boolean;
  timeoutMs: number;
} | null = null;

/** Число проверок помещается в кнопку запуска: отдельной сводки нет. */
const runLabel = computed(() =>
  t("icmp.view.runCount", {
    count: session.endless ? t("icmp.view.infinity") : formatNumber(catalog.locale, session.count),
  }),
);

/** Хотя бы одно значение вне пределов: поповер не закрывается по «Готово». */
const paramsInvalid = computed(
  () => periodInvalid.value || countInvalid.value || timeoutInvalid.value,
);

function rememberParams(): void {
  if (running.value || paramsSnapshot !== null) return;
  paramsSnapshot = {
    periodMs: session.periodMs,
    count: session.count,
    endless: session.endless,
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

function restoreParams(): void {
  if (!paramsSnapshot || running.value) return;
  session.periodMs = paramsSnapshot.periodMs;
  session.count = paramsSnapshot.count;
  session.endless = paramsSnapshot.endless;
  session.timeoutMs = paramsSnapshot.timeoutMs;
}

/** Открывает поповер параметров у сводки. */
function openParams(event: MouseEvent): void {
  if (running.value) return;

  paramsSnapshot = null;
  rememberParams();
  paramsMenu.value?.toggle(event);

  const target = event.currentTarget;
  if (target instanceof HTMLElement) anchorOverlay(target, "popover");
}

/** Применяет правку: значения уже в сеансе, остаётся закрыть поповер. */
function applyParams(): void {
  if (paramsInvalid.value) return;
  paramsMenu.value?.hide();
}

/** Возвращает значения на момент открытия поповера. */
function cancelParams(): void {
  restoreParams();
  paramsMenu.value?.hide();
}

/** Поповер закрылся: снимок правки больше не нужен. */
function onParamsHide(): void {
  paramsSnapshot = null;
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
</script>

<template>
  <ToolScreen class="icmp">
    <template #preset>
      <PresetBar :session="session" @open="presetsOpen = true" @note="presetNote = $event" />
    </template>

    <div class="tool__filters">
      <InputText
        v-model="session.filters.search"
        class="tool__search"
        size="small"
        :placeholder="t('icmp.view.search')"
        :aria-label="t('icmp.view.search')"
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
      <Select
        v-model="session.filters.status"
        :options="statusFilterOptions()"
        option-label="label"
        option-value="value"
        class="tool__filter-select"
        size="small"
        :aria-label="t('icmp.view.statusFilter')"
      />

      <div class="tool__table-actions">
        <!-- Плюс в ряду иконочных действий: единственный вход в черновик,
             в том же стиле, что настройки. -->
        <Button
          v-tooltip.top="t('common.add')"
          class="icmp__add-icon"
          icon="pi pi-plus"
          severity="secondary"
          text
          size="small"
          :aria-label="t('common.add')"
          :disabled="running"
          @click="table?.openDraft()"
        />
        <Button
          class="icmp-params__open"
          icon="pi pi-cog"
          :severity="paramsInvalid ? 'danger' : 'secondary'"
          text
          size="small"
          v-tooltip.top="t('icmp.view.paramsTitle')"
          :aria-label="t('icmp.view.paramsTitle')"
          aria-haspopup="true"
          :disabled="running"
          @click="openParams"
        />
        <Button
          class="tool__run"
          :label="running ? t('icmp.view.stop') : runLabel"
          :icon="running ? 'pi pi-stop' : 'pi pi-play'"
          :severity="running ? 'contrast' : undefined"
          size="small"
          :disabled="!running && !canRun"
          @click="toggleRun"
        />
      </div>
    </div>

    <TargetTable
      ref="table"
      :targets="visibleTargets"
      :total-targets="session.targets.length"
      :highlight-target-id="session.highlightTargetId"
      :busy="running"
      v-model:family="session.family"
      :add="addTarget"
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

    <template #overlays>
      <Popover ref="paramsMenu" @hide="onParamsHide">
        <div class="icmp-params" @keydown.esc.prevent.stop="cancelParams">
          <p class="icmp-params__title">{{ t("icmp.view.paramsTitle") }}</p>
          <div class="icmp-params__fields" @keydown.enter.prevent="applyParams">
            <div class="icmp-params__count">
              <ToolNumberField
                v-if="!session.endless"
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
              <div v-else class="icmp-params__infinite">
                <span class="tool-param__label">{{ t("icmp.view.count") }}</span>
                <span class="icmp-params__infinite-box">{{ t("icmp.view.infinity") }}</span>
              </div>
              <label class="icmp-params__endless" for="icmp-endless">
                <Checkbox
                  input-id="icmp-endless"
                  v-model="session.endless"
                  binary
                  :disabled="running"
                />
                <span>{{ t("icmp.view.endless") }}</span>
              </label>
            </div>
            <div class="icmp-params__pair">
              <ToolNumberField
                id="icmp-period"
                v-model="session.periodMs"
                :label="t('icmp.view.periodMs')"
                :min="MIN_PERIOD_MS"
                :max="MAX_PERIOD_MS"
                :step="100"
                unit=""
                :invalid="periodInvalid"
                :disabled="running"
              />
              <ToolNumberField
                id="icmp-timeout"
                v-model="session.timeoutMs"
                :label="t('icmp.view.timeoutMs')"
                :min="MIN_TIMEOUT_MS"
                :max="MAX_TIMEOUT_MS"
                :step="100"
                unit=""
                :invalid="timeoutInvalid"
                :disabled="running"
              />
            </div>
          </div>
          <div class="icmp-params__actions">
            <Button
              :label="t('common.cancel')"
              severity="secondary"
              text
              size="small"
              @click="cancelParams"
            />
            <Button
              :label="t('common.done')"
              size="small"
              :disabled="paramsInvalid"
              @click="applyParams"
            />
          </div>
        </div>
      </Popover>

      <PresetsDialog v-model:visible="presetsOpen" :session="session" @applied="forgetPresetNote" />
    </template>
  </ToolScreen>
</template>

<style scoped>
/* Шестерёнка открывает поповер настроек проверки. */
.icmp-params__open {
  flex: 0 0 auto;
}

/* Поповер параметров: тот же вид, что у подтверждений удаления. */
.icmp-params {
  min-width: 320px;
}

.icmp-params__title {
  margin: 0 0 var(--ag-space-md);
  font-size: var(--ag-text-sm);
  font-weight: 600;
}

.icmp-params__fields {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-md);
}

/* Подпись над полем: пары настроек читаются сверху вниз и не спорят
   за ширину с числами. */
.icmp-params__fields :deep(.tool-param) {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--ag-space-xs);
}

.icmp-params__fields :deep(.p-inputtext) {
  width: 100%;
}

/* Число проверок и бесконечность - один смысловой ряд. */
.icmp-params__count {
  display: flex;
  align-items: flex-end;
  gap: var(--ag-space-md);
}

.icmp-params__count :deep(.tool-param) {
  flex: 1 1 auto;
}

/* Бесконечность вместо числа: поле не притворяется пустым вводом. */
.icmp-params__infinite {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--ag-space-xs);
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.icmp-params__infinite-box {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-sm);
  background: var(--ag-surface-2);
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-lg);
  line-height: 1;
}

.icmp-params__pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ag-space-md);
}

/* Флажок стоит у поля, которое он выключает, а не отдельным этажом. */
.icmp-params__endless {
  display: inline-flex;
  align-items: center;
  gap: var(--ag-space-xs);
  padding-bottom: 5px;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-sm);
  white-space: nowrap;
  cursor: pointer;
}

.icmp-params__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ag-space-sm);
  margin-top: var(--ag-space-md);
}
</style>

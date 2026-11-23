<script setup lang="ts">
// Раздел «Окно»: геометрия, ручной ввод положения и сброс.
//
// Размер хранится в логических пикселях, положение - в физических
// (ADR 0014). Ввод положения идёт в тех же физических пикселях: только
// в них точка однозначна на общем рабочем столе.

import Button from "primevue/button";
import InputText from "primevue/inputtext";
import { useConfirm } from "primevue/useconfirm";
import { computed, onMounted, ref, watch } from "vue";
import { CONFIRM_PRIMARY_ACCEPT } from "@/core/constants";
import { t } from "@/core/infra/i18n";
import {
  loadSettings,
  moveWindow,
  resetWindow,
  settings,
  status,
} from "@/core/services/settings/index";
import { requireConfirm } from "@/ui/primevue/popup/confirmPopup";
import { parseCoordinate, type ParsedCoordinate } from "../parseCoordinate";

const confirm = useConfirm();

const geometry = computed(() => settings.current?.window ?? null);

/** Размер окна: ширина × высота в логических пикселях. */
const size = computed(() =>
  geometry.value ? `${geometry.value.width} × ${geometry.value.height}` : "-",
);

/** Сохранённые координаты в том виде, в каком они стоят в полях. */
const savedX = computed(() => (geometry.value?.x == null ? "" : String(geometry.value.x)));
const savedY = computed(() => (geometry.value?.y == null ? "" : String(geometry.value.y)));

const x = ref("");
const y = ref("");

/** Пользователь правил поля: внешнее изменение не должно затирать ввод. */
const touched = ref(false);

const readX = computed(() => parseCoordinate(x.value));
const readY = computed(() => parseCoordinate(y.value));
const parsedX = computed(() => ("value" in readX.value ? readX.value.value : null));
const parsedY = computed(() => ("value" in readY.value ? readY.value.value : null));

/** Ошибка поля: пустое поле ошибкой не считается, кнопка просто молчит. */
function problem(read: ParsedCoordinate, input: string): string {
  if ("value" in read || input.trim() === "") return "";
  return read.problem === "range"
    ? t("settings.window.positionRange")
    : t("settings.window.positionInvalid");
}

const xError = computed(() => problem(readX.value, x.value));
const yError = computed(() => problem(readY.value, y.value));

const changed = computed(() => x.value !== savedX.value || y.value !== savedY.value);
const canApply = computed(
  () =>
    changed.value &&
    parsedX.value !== null &&
    parsedY.value !== null &&
    !status.window.loading &&
    settings.loaded,
);

/** Показывает сохранённые координаты: отмена и ответ ядра делают одно и то же. */
function sync(): void {
  x.value = savedX.value;
  y.value = savedY.value;
  touched.value = false;
}

/** Отмечает, что поля правят вручную. */
function markTouched(): void {
  touched.value = true;
}

/** Применяет введённое положение; ядро отвечает фактическим. */
async function apply(): Promise<void> {
  if (!canApply.value || parsedX.value === null || parsedY.value === null) return;

  const next = await moveWindow(parsedX.value, parsedY.value);
  if (!next) return;

  sync();
}

function requestReset(event: MouseEvent): void {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return;

  requireConfirm(confirm, {
    target,
    message: t("settings.window.resetMessage"),
    acceptLabel: t("settings.window.resetAccept"),
    rejectLabel: t("settings.window.resetReject"),
    acceptProps: CONFIRM_PRIMARY_ACCEPT,
    accept: () => void resetWindow().then(sync),
  });
}

// Геометрию меняет и сам пользователь, перетаскивая окно: тогда поля
// показывают новое место. Во время набора ввод не затирается.
watch(
  geometry,
  () => {
    if (!touched.value) sync();
  },
  { immediate: true },
);

onMounted(() => {
  void loadSettings();
});
</script>

<template>
  <section class="window wb-section">
    <header class="wb-section__head">
      <h2 class="wb-section__title">{{ t("settings.section.window") }}</h2>
      <p class="wb-section__lead">{{ t("settings.window.lead") }}</p>
    </header>

    <dl class="window__facts">
      <div class="window__fact">
        <dt>{{ t("settings.window.size") }}</dt>
        <dd class="mono">{{ size }}</dd>
      </div>
      <div class="window__fact">
        <dt class="window__label-line">
          <span>{{ t("settings.window.position") }}</span>
          <span class="window__hint">{{ t("settings.window.positionHint") }}</span>
        </dt>
        <dd class="window__position">
          <div class="window__field">
            <label class="window__field-label" for="window-position-x">
              {{ t("settings.window.positionX") }}
            </label>
            <InputText
              id="window-position-x"
              v-model="x"
              size="small"
              inputmode="numeric"
              autocomplete="off"
              spellcheck="false"
              :class="{ 'p-invalid': xError }"
              :aria-invalid="xError !== ''"
              :aria-label="t('settings.window.positionXLabel')"
              :placeholder="t('settings.window.positionAuto')"
              @update:model-value="markTouched"
              @keydown.enter.prevent="apply"
              @keydown.esc="sync"
            />
            <p v-if="xError" class="window__field-error" role="alert">{{ xError }}</p>
          </div>

          <div class="window__field">
            <label class="window__field-label" for="window-position-y">
              {{ t("settings.window.positionY") }}
            </label>
            <InputText
              id="window-position-y"
              v-model="y"
              size="small"
              inputmode="numeric"
              autocomplete="off"
              spellcheck="false"
              :class="{ 'p-invalid': yError }"
              :aria-invalid="yError !== ''"
              :aria-label="t('settings.window.positionYLabel')"
              :placeholder="t('settings.window.positionAuto')"
              @update:model-value="markTouched"
              @keydown.enter.prevent="apply"
              @keydown.esc="sync"
            />
            <p v-if="yError" class="window__field-error" role="alert">{{ yError }}</p>
          </div>

          <Button
            :label="t('settings.window.positionApply')"
            size="small"
            :loading="status.window.loading"
            :disabled="!canApply"
            @click="apply"
          />
        </dd>
      </div>
    </dl>

    <div class="window__actions">
      <Button
        :label="t('settings.window.reset')"
        icon="pi pi-window-maximize"
        size="small"
        severity="secondary"
        outlined
        :loading="status.window.loading"
        :disabled="!settings.loaded"
        @click="requestReset"
      />
    </div>

    <p v-if="status.load.error" class="window__error">{{ status.load.error }}</p>
    <p v-if="status.window.error" class="window__error">
      {{ status.window.error }}
    </p>
  </section>
</template>

<style scoped>
.window__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--ag-space-lg);
  margin: 0;
}

.window__fact {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-xs);
  padding: var(--ag-space-lg);
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-md);
  background: var(--ag-surface);
}

.window__fact dt {
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.window__fact dd {
  margin: 0;
  font-size: var(--ag-text-sm);
}

/* Пояснение единиц идёт за подписью через точку-разделитель:
   это справка о координатах, а не часть подписи. */
.window__label-line {
  display: flex;
  align-items: baseline;
  gap: var(--ag-space-sm);
  flex-wrap: wrap;
}

.window__hint {
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.window__hint::before {
  margin-right: var(--ag-space-sm);
  content: "•";
}

.window__position {
  display: flex;
  align-items: flex-end;
  gap: var(--ag-space-sm);
  flex-wrap: wrap;
}

.window__field {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-xs);
  width: 112px;
}

.window__field-label {
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.window__field-error {
  margin: 0;
  color: var(--ag-danger);
  font-size: var(--ag-text-xs);
}

.window__actions {
  display: flex;
  align-items: center;
  gap: var(--ag-space-sm);
  flex-wrap: wrap;
}

.window__error {
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

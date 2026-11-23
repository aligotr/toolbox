<script setup lang="ts">
// Раздел «Окно»: ручной ввод размера и положения и сброс.
//
// Размер хранится в логических пикселях, положение - в физических
// (ADR 0014). Ввод размера идёт в тех же логических пикселях, что и показ,
// ввод положения - в физических: только там точка однозначна на общем столе.

import Button from "primevue/button";
import { useConfirm } from "primevue/useconfirm";
import { computed, onMounted, ref, watch } from "vue";
import { CONFIRM_PRIMARY_ACCEPT } from "@/core/constants";
import { t } from "@/core/infra/i18n";
import {
  loadSettings,
  moveWindow,
  resizeWindow,
  resetWindow,
  settings,
  status,
} from "@/core/services/settings/index";
import { requireConfirm } from "@/ui/primevue/popup/confirmPopup";
import WindowNumberField from "../WindowNumberField.vue";
import {
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  parseCoordinate,
  parseSize,
  type ParsedInteger,
} from "../parseCoordinate";

const confirm = useConfirm();

const geometry = computed(() => settings.current?.window ?? null);

/** Сохранённые числа: сравнение идёт числами, а не строками полей. */
const savedWidth = computed(() => geometry.value?.width ?? null);
const savedHeight = computed(() => geometry.value?.height ?? null);
const savedX = computed(() => geometry.value?.x ?? null);
const savedY = computed(() => geometry.value?.y ?? null);

/** Строки, которые стоят в полях. */
const width = ref("");
const height = ref("");
const x = ref("");
const y = ref("");

/** Форму правил пользователь: внешнее изменение не должно затирать ввод. */
const sizeTouched = ref(false);
const positionTouched = ref(false);

const readWidth = computed(() => parseSize(width.value, MIN_WINDOW_WIDTH));
const readHeight = computed(() => parseSize(height.value, MIN_WINDOW_HEIGHT));
const readX = computed(() => parseCoordinate(x.value));
const readY = computed(() => parseCoordinate(y.value));

/** Значение поля или `null`, пока ввод не готов. */
function number(read: ParsedInteger): number | null {
  return "value" in read ? read.value : null;
}

/** Текст причины отказа; `null` - поле верно. */
function problem(read: ParsedInteger, emptyAllowed: boolean): string | null {
  if ("value" in read) return null;
  if (emptyAllowed && read.problem === "empty") return null;

  return read.problem === "range"
    ? t("settings.window.positionRange")
    : t("settings.window.positionInvalid");
}

/**
 * Текст ошибки поля.
 *
 * До чтения настроек поля пусты: сообщение в этот миг было бы ложным.
 * Положение «выбирает система» - это оба пустых поля, а не одно: заполненная
 * и пустая координаты рядом точки не образуют.
 */
function error(read: ParsedInteger, emptyAllowed: boolean): string {
  if (!settings.loaded) return "";

  return problem(read, emptyAllowed) ?? "";
}

const positionEmpty = computed(() => x.value.trim() === "" && y.value.trim() === "");

const widthError = computed(() => error(readWidth.value, false));
const heightError = computed(() => error(readHeight.value, false));
const xError = computed(() => error(readX.value, positionEmpty.value));
const yError = computed(() => error(readY.value, positionEmpty.value));

const parsedWidth = computed(() => number(readWidth.value));
const parsedHeight = computed(() => number(readHeight.value));
const parsedX = computed(() => number(readX.value));
const parsedY = computed(() => number(readY.value));

/** Изменена ли часть геометрии. */
const sizeChanged = computed(
  () => parsedWidth.value !== savedWidth.value || parsedHeight.value !== savedHeight.value,
);
const positionChanged = computed(
  () => parsedX.value !== savedX.value || parsedY.value !== savedY.value,
);

const ready = computed(() => settings.loaded && !status.window.loading);

/**
 * Размер и положение - одна форма окна, поэтому кнопка одна.
 *
 * Применяется только изменённая часть: незатронутые поля окно не трогают.
 * Неверное число в изменённой части запрещает применение целиком.
 */
const canApply = computed(() => {
  if (!ready.value) return false;

  const sizeReady =
    !sizeChanged.value || (parsedWidth.value !== null && parsedHeight.value !== null);
  const positionReady =
    !positionChanged.value || (parsedX.value !== null && parsedY.value !== null);

  return (sizeChanged.value || positionChanged.value) && sizeReady && positionReady;
});

/** Показ сохранённых чисел: отмена и ответ ядра делают одно и то же. */
function syncSize(): void {
  width.value = savedWidth.value == null ? "" : String(savedWidth.value);
  height.value = savedHeight.value == null ? "" : String(savedHeight.value);
  sizeTouched.value = false;
}

function syncPosition(): void {
  x.value = savedX.value == null ? "" : String(savedX.value);
  y.value = savedY.value == null ? "" : String(savedY.value);
  positionTouched.value = false;
}

/** Отметка, что поля правят вручную. */
function markSizeTouched(): void {
  sizeTouched.value = true;
}

/** Отметка, что поля правят вручную. */
function markPositionTouched(): void {
  positionTouched.value = true;
}

/** Применение изменённых чисел; ядро отвечает фактической геометрией. */
async function apply(): Promise<void> {
  if (!canApply.value) return;

  if (sizeChanged.value) {
    const nextWidth = parsedWidth.value;
    const nextHeight = parsedHeight.value;
    if (nextWidth === null || nextHeight === null) return;
    if (!(await resizeWindow(nextWidth, nextHeight))) {
      syncSize();
      return;
    }
  }

  if (positionChanged.value) {
    const nextX = parsedX.value;
    const nextY = parsedY.value;
    if (nextX === null || nextY === null) return;
    if (!(await moveWindow(nextX, nextY))) {
      syncPosition();
      return;
    }
  }

  syncSize();
  syncPosition();
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
    accept: () =>
      void resetWindow().then(() => {
        syncSize();
        syncPosition();
      }),
  });
}

// Геометрию меняет и сам пользователь, перетаскивая окно: тогда поля
// показывают новое место. Во время набора ввод не затирается.
watch(
  geometry,
  () => {
    if (!sizeTouched.value) syncSize();
    if (!positionTouched.value) syncPosition();
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
        <dd class="window__form">
          <div class="window__row">
            <WindowNumberField
              id="window-size-width"
              v-model="width"
              :label="t('settings.window.width')"
              :accessible-label="t('settings.window.widthLabel')"
              :error="widthError"
              @update:model-value="markSizeTouched"
              @submit="apply"
              @cancel="syncSize"
            />
            <WindowNumberField
              id="window-size-height"
              v-model="height"
              :label="t('settings.window.height')"
              :accessible-label="t('settings.window.heightLabel')"
              :error="heightError"
              @update:model-value="markSizeTouched"
              @submit="apply"
              @cancel="syncSize"
            />
          </div>
        </dd>
      </div>

      <div class="window__fact">
        <dt>{{ t("settings.window.position") }}</dt>
        <dd class="window__form">
          <div class="window__row">
            <WindowNumberField
              id="window-position-x"
              v-model="x"
              :label="t('settings.window.positionX')"
              :accessible-label="t('settings.window.positionXLabel')"
              :error="xError"
              :placeholder="t('settings.window.positionAuto')"
              @update:model-value="markPositionTouched"
              @submit="apply"
              @cancel="syncPosition"
            />
            <WindowNumberField
              id="window-position-y"
              v-model="y"
              :label="t('settings.window.positionY')"
              :accessible-label="t('settings.window.positionYLabel')"
              :error="yError"
              :placeholder="t('settings.window.positionAuto')"
              @update:model-value="markPositionTouched"
              @submit="apply"
              @cancel="syncPosition"
            />
          </div>
        </dd>
      </div>
    </dl>

    <div class="window__actions">
      <Button
        :label="t('settings.window.positionApply')"
        size="small"
        :loading="status.window.loading"
        :disabled="!canApply"
        @click="apply"
      />
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
/* Карточки идут друг под другом: размера и положения. */
.window__facts {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
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

.window__form {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-sm);
}

.window__row {
  display: flex;
  align-items: flex-start;
  gap: var(--ag-space-lg);
  flex-wrap: wrap;
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
</style>

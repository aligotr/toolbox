<script setup lang="ts">
// Раздел «Окно»: текущая геометрия и сброс к значениям по умолчанию.
//
// Размер хранится в логических пикселях, положение — в физических
// (ADR 0014). Интерфейсу это знать не нужно: он показывает числа, которые
// сохранило ядро, и не пересчитывает их под свой масштаб.

import Button from "primevue/button";
import { useConfirm } from "primevue/useconfirm";
import { computed, onMounted } from "vue";
import { loadSettings, resetWindow, settings, status } from "../../core/settings";

const confirm = useConfirm();

const geometry = computed(() => settings.current?.window ?? null);

/** Размер окна: ширина × высота в логических пикселях. */
const size = computed(() =>
  geometry.value ? `${geometry.value.width} × ${geometry.value.height}` : "—",
);

/** Положение окна; до первого перемещения его выбирает система. */
const position = computed(() => {
  const window = geometry.value;
  if (!window || window.x === null || window.y === null) {
    return "положение выбирает система";
  }
  return `${window.x}, ${window.y}`;
});

const mode = computed(() =>
  geometry.value?.maximized ? "развёрнуто на весь экран" : "обычное",
);

function requestReset(): void {
  confirm.require({
    header: "Сброс окна",
    message:
      "Размер и положение окна вернутся к значениям по умолчанию. " +
      "Содержимое вкладок не изменится.",
    acceptLabel: "Сбросить",
    rejectLabel: "Отмена",
    accept: () => void resetWindow(),
  });
}

onMounted(() => {
  void loadSettings();
});
</script>

<template>
  <section class="window">
    <header class="window__head">
      <h2 class="window__title">Окно</h2>
      <p class="window__lead">
        Размер и положение запоминаются между запусками. Если окно оказалось
        за краем экрана, сброс вернёт его в пределы рабочей области монитора.
      </p>
    </header>

    <dl class="window__facts">
      <div class="window__fact">
        <dt>Текущий размер</dt>
        <dd class="mono">{{ size }}</dd>
      </div>
      <div class="window__fact">
        <dt>Положение</dt>
        <dd class="mono">{{ position }}</dd>
      </div>
      <div class="window__fact">
        <dt>Состояние</dt>
        <dd>{{ mode }}</dd>
      </div>
    </dl>

    <div class="window__actions">
      <Button
        label="Сбросить размер и положение"
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
.window {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.window__head {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.window__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.window__lead {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 14px;
  line-height: 1.5;
}

.window__facts {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 0;
}

.window__fact {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px;
  border: 1px solid var(--p-surface-700);
  border-radius: 8px;
  background: var(--p-surface-900);
}

.window__fact dt {
  color: var(--p-text-muted-color);
  font-size: 13px;
}

.window__fact dd {
  margin: 0;
  font-size: 14px;
}

.window__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.window__error {
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

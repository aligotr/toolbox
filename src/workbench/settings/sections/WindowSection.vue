<script setup lang="ts">
// Раздел «Окно»: текущая геометрия и сброс к значениям по умолчанию.
//
// Размер хранится в логических пикселях, положение — в физических
// (ADR 0014). Интерфейсу это знать не нужно: он показывает числа, которые
// сохранило ядро, и не пересчитывает их под свой масштаб.

import Button from "primevue/button";
import { useConfirm } from "primevue/useconfirm";
import { computed, onMounted } from "vue";
import { CONFIRM_CALM_REJECT } from "@/core/constants";
import { t } from "@/core/infra/i18n";
import { loadSettings, resetWindow, settings, status } from "@/core/services/settings/index";

const confirm = useConfirm();

const geometry = computed(() => settings.current?.window ?? null);

/** Размер окна: ширина × высота в логических пикселях. */
const size = computed(() =>
  geometry.value ? `${geometry.value.width} × ${geometry.value.height}` : "-",
);

/** Положение окна; до первого перемещения его выбирает система. */
const position = computed(() => {
  const window = geometry.value;
  if (!window || window.x === null || window.y === null) {
    return t("settings.window.systemPosition");
  }
  return `${window.x}, ${window.y}`;
});

function requestReset(): void {
  confirm.require({
    header: t("settings.window.resetHeader"),
    message: t("settings.window.resetMessage"),
    acceptLabel: t("settings.window.resetAccept"),
    rejectLabel: t("settings.window.resetReject"),
    rejectProps: CONFIRM_CALM_REJECT,
    accept: () => void resetWindow(),
  });
}

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
        <dt>{{ t("settings.window.position") }}</dt>
        <dd class="mono">{{ position }}</dd>
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

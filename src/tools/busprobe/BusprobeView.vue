<script setup lang="ts">
// Панель инструмента Busprobe.
//
// Экран работает как демонстрация шины: одна кнопка отправляет учебный `ask`,
// ядро записывает этапы цепочки, интерфейс сразу показывает ответ и весь
// путь, а пояснение к этапу раскрывается по клику.
//
// Мост, подписки и состояние операции живут в `api.ts` и `useBusprobe.ts`;
// показ пути в `RoutePanel.vue`; здесь только шапка, форма и ответ.

import Button from "primevue/button";
import InputText from "primevue/inputtext";
import { onMounted, onUnmounted } from "vue";
import { catalog, t } from "@/core/infra/i18n";
import RoutePanel from "./RoutePanel.vue";
import { TOOL_TITLE } from "./constants";
import { formatMs } from "./format";
import { useBusprobe } from "./useBusprobe";

const { echo, status, reply, elapsedMs, chain, rows, selected, checkBus, toggle, start, stop } =
  useBusprobe();

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString(catalog.locale);
}

onMounted(() => {
  void start();
});

onUnmounted(() => {
  stop();
});
</script>

<template>
  <section class="busprobe">
    <header class="busprobe__heading">
      <h1 class="busprobe__title">{{ TOOL_TITLE }}</h1>
      <p class="busprobe__lead">{{ t("busprobe.view.lead") }}</p>
    </header>

    <div class="busprobe__body">
      <div class="busprobe__form">
        <InputText
          v-model="echo"
          class="busprobe__input"
          size="small"
          :aria-label="t('busprobe.view.inputAria')"
          :placeholder="t('busprobe.view.inputPlaceholder')"
          :disabled="status.loading"
          @keyup.enter="checkBus"
        />
        <Button
          :label="t('busprobe.view.check')"
          icon="pi pi-bolt"
          size="small"
          :loading="status.loading"
          @click="checkBus"
        />
      </div>

      <p v-if="status.error" class="busprobe__error">
        <i class="pi pi-exclamation-circle" aria-hidden="true" />
        {{ status.error }}
      </p>

      <section v-if="reply" class="reply">
        <h2 class="busprobe__section-title">{{ t("common.answer") }}</h2>

        <dl class="reply__facts">
          <div class="reply__fact">
            <dt>echo</dt>
            <dd>{{ reply.echo ?? "нет" }}</dd>
          </div>
          <div class="reply__fact">
            <dt>correlation_id</dt>
            <dd class="mono">{{ reply.correlation_id ?? "нет" }}</dd>
          </div>
          <div class="reply__fact">
            <dt>{{ t("busprobe.view.sentAt") }}</dt>
            <dd>{{ formatTime(reply.at) }}</dd>
          </div>
          <div v-if="elapsedMs !== null" class="reply__fact">
            <dt>{{ t("busprobe.view.roundTrip") }}</dt>
            <dd>{{ formatMs(elapsedMs, 1) }}</dd>
          </div>
        </dl>

        <p class="busprobe__note">{{ t("busprobe.view.note") }}</p>
      </section>

      <RoutePanel v-if="chain" :chain="chain" :rows="rows" :selected="selected" @toggle="toggle" />
    </div>
  </section>
</template>

<style scoped>
.busprobe {
  display: flex;
  flex-direction: column;
}

.busprobe__heading {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-sm);
  margin-block-end: var(--ag-space-heading);
}

.busprobe__body {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-xl);
}

.busprobe__title {
  margin: 0;
  font-size: var(--ag-text-xl);
  line-height: 1.25;
}

.busprobe__lead {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-md);
}

.busprobe__form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ag-space-sm) var(--ag-space-lg);
}

.busprobe__input {
  width: var(--ag-field-width);
}

.busprobe__error {
  display: flex;
  align-items: center;
  gap: var(--ag-space-sm);
  margin: 0;
  color: var(--ag-danger);
  font-size: var(--ag-text-sm);
}

.busprobe__section-title {
  margin: 0;
  font-size: var(--ag-text-lg);
  font-weight: 600;
}

.busprobe__note {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-sm);
  line-height: 1.55;
}

.reply {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-lg);
}

.reply__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--ag-space-lg);
  margin: 0;
}

.reply__fact {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-xs);
  padding: var(--ag-space-lg);
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-md);
  background: var(--ag-surface-2);
}

.reply__fact dt {
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.reply__fact dd {
  margin: 0;
  font-size: var(--ag-text-sm);
  overflow-wrap: anywhere;
}

.mono {
  font-family: var(--ag-font-mono);
  font-size: var(--ag-text-xs);
}
</style>

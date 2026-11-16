<script setup lang="ts">
// Панель инструмента Busprobe.
//
// Смысл экрана «Как работает шина» сохранён: кнопка отправляет настоящий
// `ask`, ядро записывает этапы цепочки, интерфейс показывает весь путь сразу,
// а пояснение к этапу раскрывается по клику.
//
// Мост, подписки и состояния операций живут в `api.ts` и `useBusprobe.ts`;
// показ пути — в `RoutePanel.vue`; здесь только шапка, форма и ответ.

import Button from "primevue/button";
import InputText from "primevue/inputtext";
import { computed, onMounted, onUnmounted } from "vue";
import { catalog, t } from "@/core/infra/i18n";
import RoutePanel from "./RoutePanel.vue";
import { TOOL_TITLE } from "./constants";
import { formatMs } from "./format";
import { useBusprobe } from "./useBusprobe";

type BadgeTone = "muted" | "ok";

const {
  echo,
  status,
  reply,
  elapsedMs,
  chain,
  rows,
  selected,
  checkBus,
  showPath,
  toggle,
  start,
  stop,
} = useBusprobe();

/** Короткое состояние для метки в шапке. */
const badge = computed<{ text: string; tone: BadgeTone }>(() => {
  if (status.ping.loading) return { text: t("busprobe.view.badgePing"), tone: "muted" };
  if (status.trace.loading) return { text: t("busprobe.view.badgeTrace"), tone: "muted" };
  if (chain.value) return { text: t("busprobe.view.badgeTraced"), tone: "ok" };
  if (reply.value) return { text: t("busprobe.view.badgeReplied"), tone: "ok" };
  return { text: t("busprobe.view.badgeReady"), tone: "muted" };
});

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
    <header class="busprobe__head">
      <div class="busprobe__heading">
        <h1 class="busprobe__title">{{ TOOL_TITLE }}</h1>
        <p class="busprobe__lead">{{ t("busprobe.view.lead") }}</p>
      </div>
      <span class="busprobe__badge">
        <i class="busprobe__badge-dot" :class="`busprobe__badge-dot--${badge.tone}`" />
        {{ badge.text }}
      </span>
    </header>

    <div class="busprobe__form">
      <InputText
        v-model="echo"
        class="busprobe__input"
        size="small"
        :aria-label="t('busprobe.view.inputAria')"
        :placeholder="t('busprobe.view.inputPlaceholder')"
        :disabled="status.ping.loading || status.trace.loading"
        @keyup.enter="checkBus"
      />
      <Button
        :label="t('busprobe.view.check')"
        icon="pi pi-bolt"
        size="small"
        :loading="status.ping.loading"
        @click="checkBus"
      />
      <Button
        :label="t('busprobe.view.showPath')"
        icon="pi pi-share-alt"
        severity="secondary"
        outlined
        size="small"
        :loading="status.trace.loading"
        @click="showPath"
      />
    </div>

    <p v-if="status.ping.error" class="busprobe__error">
      <i class="pi pi-exclamation-circle" aria-hidden="true" />
      {{ status.ping.error }}
    </p>
    <p v-if="status.trace.error" class="busprobe__error">
      <i class="pi pi-exclamation-circle" aria-hidden="true" />
      {{ status.trace.error }}
    </p>

    <section v-if="reply" class="reply">
      <h2 class="busprobe__section-title">{{ t("busprobe.view.replyTitle") }}</h2>

      <dl class="reply__facts">
        <div class="reply__fact">
          <dt>echo</dt>
          <dd>{{ reply.echo ?? "—" }}</dd>
        </div>
        <div class="reply__fact">
          <dt>correlation_id</dt>
          <dd class="mono">{{ reply.correlation_id ?? "—" }}</dd>
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
  </section>
</template>

<style scoped>
.busprobe {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-xl);
}

.busprobe__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ag-space-lg);
}

.busprobe__heading {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  gap: var(--ag-space-sm);
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

.busprobe__badge {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: var(--ag-space-sm);
  padding-top: var(--ag-space-sm);
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.busprobe__badge-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--ag-radius-round);
  background: currentColor;
}

.busprobe__badge-dot--ok {
  background: var(--ag-ok);
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

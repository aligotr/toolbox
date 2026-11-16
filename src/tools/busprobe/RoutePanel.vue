<script setup lang="ts">
// Панель пути сообщения.
//
// Показывает записанную цепочку целиком: границы сообщений, настоящее
// ожидание и этапы. Пояснение к этапу раскрывается по клику и не остаётся
// за краем экрана.
//
// Подписи действующих лиц и тексты пояснений принадлежат показу пути,
// поэтому живут здесь, а не в состоянии инструмента.

import { computed, nextTick } from "vue";
import type { ComponentPublicInstance } from "vue";
import { t } from "@/core/infra/i18n";
import type { TraceChain } from "./api";
import { formatMs } from "./format";
import type { RouteRow } from "./useBusprobe";

const props = defineProps<{
  chain: TraceChain;
  rows: RouteRow[];
  /** Номер раскрытого этапа; `null` — все свёрнуты. */
  selected: number | null;
}>();

const emit = defineEmits<{ toggle: [index: number] }>();

/**
 * Кто действует на этапе.
 *
 * Подписи собираются при показе, а не хранятся строкой: смена языка
 * перерисовывает путь без перезапуска (ADR 0039).
 */
const actors = computed<Record<string, string>>(() => ({
  "ask.start": t("busprobe.actor.ui"),
  "route.decode": t("busprobe.actor.bus"),
  "queue.enqueue": t("busprobe.actor.bus"),
  "dispatch.begin": t("busprobe.actor.dispatcher"),
  "handler.invoke": t("busprobe.actor.module"),
  "publish(reply)": t("busprobe.actor.module"),
  "correlation.match": t("busprobe.actor.dispatcher"),
  "sink.emit": t("busprobe.actor.bridge"),
  "ask.reply": t("busprobe.actor.ui"),
}));

/** Пояснение к этапу — то, ради чего прогон вообще показывается. */
const explanations = computed<Record<string, string>>(() => ({
  "ask.start": t("busprobe.stage.askStart"),
  "route.decode": t("busprobe.stage.routeDecode"),
  "queue.enqueue": t("busprobe.stage.queueEnqueue"),
  "dispatch.begin": t("busprobe.stage.dispatchBegin"),
  "handler.invoke": t("busprobe.stage.handlerInvoke"),
  "publish(reply)": t("busprobe.stage.publishReply"),
  "correlation.match": t("busprobe.stage.correlationMatch"),
  "sink.emit": t("busprobe.stage.sinkEmit"),
  "ask.reply": t("busprobe.stage.askReply"),
}));

const selectedStage = computed(() =>
  props.selected === null ? null : (props.chain.stages[props.selected] ?? null),
);

const outcomeText = computed(() => {
  switch (props.chain.outcome) {
    case "ok":
      return t("busprobe.route.outcomeOk");
    case "timeout":
      return t("busprobe.route.outcomeTimeout");
    default:
      return t("busprobe.route.outcomeError");
  }
});

const outcomeTone = computed<string>(() => {
  switch (props.chain.outcome) {
    case "ok":
      return "ok";
    case "timeout":
      return "warn";
    default:
      return "danger";
  }
});

function actorOf(name: string): string {
  return actors.value[name] ?? t("busprobe.actor.core");
}

function explanationOf(name: string): string {
  return explanations.value[name] ?? "";
}

/** Настоящее ожидание в очереди: миллисекунды в виде локали. */
function waitText(ms: number): string {
  return t("busprobe.route.wait", { ms: formatMs(ms, 1) });
}

/** Раскрытые карточки по номеру этапа: `ref` внутри `v-for` собирается в массив. */
const explainBoxes = new Map<number, HTMLElement>();

function keepExplain(el: Element | ComponentPublicInstance | null, index: number): void {
  if (el instanceof HTMLElement) explainBoxes.set(index, el);
  else explainBoxes.delete(index);
}

/** Клик по этапу: пояснение раскрывается под ним и не остаётся за краем. */
async function choose(index: number): Promise<void> {
  const opening = props.selected !== index;
  emit("toggle", index);
  if (!opening) return;

  await nextTick();
  explainBoxes.get(index)?.scrollIntoView({ block: "nearest" });
}
</script>

<template>
  <section class="route">
    <header class="route__head">
      <h2 class="route__title">{{ t("busprobe.route.title") }}</h2>
      <div class="route__meta">
        <span>{{ t("busprobe.route.stages", { count: chain.stages.length }) }}</span>
        <span>{{ formatMs(chain.elapsed_ms, 1) }}</span>
        <span class="route__outcome" :class="`route__outcome--${outcomeTone}`">
          {{ outcomeText }}
        </span>
      </div>
    </header>

    <ol class="route__list">
      <template v-for="row in rows" :key="`${row.kind}-${row.at}`">
        <li v-if="row.kind === 'divider'" class="route__divider">{{ row.title }}</li>

        <li v-else-if="row.kind === 'wait'" class="route__wait">
          {{ waitText(row.ms ?? 0) }}
        </li>

        <li v-else class="route__item">
          <button
            class="route__stage"
            :class="{ 'route__stage--active': selectedStage === row.stage }"
            type="button"
            :aria-expanded="selectedStage === row.stage"
            @click="choose(row.index ?? 0)"
          >
            <span class="route__actor">
              {{ actorOf(row.stage?.name ?? "") }}
            </span>
            <code class="route__name">{{ row.stage?.name }}</code>
            <span class="route__time">{{ formatMs(row.stage?.at_ms ?? 0, 2) }}</span>
            <i
              class="pi route__chevron"
              :class="selectedStage === row.stage ? 'pi-angle-up' : 'pi-angle-down'"
              aria-hidden="true"
            />
          </button>

          <article
            v-if="selectedStage === row.stage"
            :ref="(el) => keepExplain(el, row.index ?? 0)"
            class="route__explain"
          >
            <p class="route__explain-text">
              {{ explanationOf(row.stage?.name ?? "") }}
            </p>
          </article>
        </li>
      </template>
    </ol>
  </section>
</template>

<style scoped>
.route {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-lg);
}

.route__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ag-space-lg);
}

.route__title {
  margin: 0;
  font-size: var(--ag-text-lg);
  font-weight: 600;
}

.route__meta {
  display: flex;
  align-items: center;
  gap: var(--ag-space-lg);
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.route__list {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-xs);
  margin: 0;
  padding: 0;
  list-style: none;
}

.route__divider {
  padding: var(--ag-space-sm) 0;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.route__wait {
  padding: var(--ag-space-sm);
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
  text-align: center;
}

.route__item {
  display: flex;
  flex-direction: column;
}

.route__stage {
  display: flex;
  align-items: center;
  gap: var(--ag-space-lg);
  width: 100%;
  padding: var(--ag-space-sm);
  border: 1px solid transparent;
  border-radius: var(--ag-radius-sm);
  background: transparent;
  color: var(--p-text-color);
  font: inherit;
  font-size: var(--ag-text-sm);
  text-align: left;
  cursor: pointer;
}

.route__stage:hover {
  background: var(--ag-surface-2);
}

.route__stage--active,
.route__stage--active:hover {
  border-color: var(--ag-border);
  border-bottom-color: transparent;
  border-radius: var(--ag-radius-md) var(--ag-radius-md) 0 0;
  background: var(--ag-surface);
}

.route__stage:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.route__actor {
  flex-shrink: 0;
  width: 104px;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.route__outcome {
  font-size: var(--ag-text-xs);
  font-weight: 600;
}

.route__outcome--ok {
  color: var(--ag-ok);
}

.route__outcome--warn {
  color: var(--ag-warn);
}

.route__outcome--danger {
  color: var(--ag-danger);
}

.route__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-family: var(--ag-font-mono);
  font-size: var(--ag-text-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.route__time {
  flex-shrink: 0;
  color: var(--p-text-muted-color);
  font-family: var(--ag-font-mono);
  font-size: var(--ag-text-xs);
}

.route__chevron {
  flex-shrink: 0;
  color: var(--p-text-muted-color);
  font-size: 12px;
}

.route__explain {
  padding: var(--ag-space-lg);
  border: 1px solid var(--ag-border);
  border-radius: 0 0 var(--ag-radius-md) var(--ag-radius-md);
  background: var(--ag-surface);
  scroll-margin-block: var(--ag-space-lg);
}

.route__explain-text {
  margin: 0;
  color: var(--p-text-color);
  font-size: var(--ag-text-sm);
  line-height: 1.6;
}
</style>

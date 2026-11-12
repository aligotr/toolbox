<script setup lang="ts">
// Модуль «Как работает шина».
//
// Учебный прогон: кнопка отправляет настоящий `ask` через настоящую шину,
// ядро записывает этапы этой цепочки (ADR 0007) и отдаёт её целиком.
// Интерфейс проигрывает запись с паузами и пояснениями — данные настоящие,
// темп искусственный.

import { computed, onMounted, onUnmounted, ref } from "vue";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { askTraced, subscribeEvent } from "../../core/bus";
import { write } from "../../core/journal";

/** Показательная задержка ответа: настоящая, выполняется в отдельном потоке. */
const DELAY_MS = 120;

/** Этап цепочки — как его отдаёт ядро. */
interface TraceStage {
  name: string;
  topic: string;
  at_ms: number;
  detail: string | null;
}

/** Записанная цепочка `ask`. */
interface TraceChain {
  topic: string;
  reply_topic: string;
  stages: TraceStage[];
  outcome: "ok" | "timeout" | "error";
  elapsed_ms: number;
}

/** Строка проигрывания: этап, разделитель сообщения или полоса ожидания. */
interface Row {
  kind: "stage" | "divider" | "wait";
  /** Сколько этапов должно быть показано, чтобы строка появилась. */
  at: number;
  index?: number;
  stage?: TraceStage;
  title?: string;
  ms?: number;
}

/** Кто действует на этапе: подпись и ключ оформления. */
const ACTORS: Record<string, { key: string; label: string }> = {
  "ask.start": { key: "ui", label: "интерфейс" },
  "route.decode": { key: "bus", label: "шина" },
  "queue.enqueue": { key: "bus", label: "шина" },
  "dispatch.begin": { key: "dispatcher", label: "диспетчер" },
  "handler.invoke": { key: "module", label: "модуль" },
  "publish(reply)": { key: "module", label: "модуль" },
  "correlation.match": { key: "dispatcher", label: "диспетчер" },
  "sink.emit": { key: "bridge", label: "мост" },
  "ask.reply": { key: "ui", label: "интерфейс" },
};

/** Пояснение к этапу — то, ради чего модуль существует. */
const EXPLANATIONS: Record<string, string> = {
  "ask.start":
    "Интерфейс просит ядро отправить запрос и дождаться ответа. Ядро создаёт correlation_id — по нему потом найдётся ожидающий. С этого момента поток команды спит.",
  "route.decode":
    "Ядро переводит JSON из интерфейса в типизированное сообщение Rust. Ошибка разбора оборвала бы цепочку здесь — до очереди дело бы не дошло.",
  "queue.enqueue":
    "Сообщение кладётся в очередь. Дальше его возьмёт отдельный поток-диспетчер: на этом месте путь расходится по времени, и появляется асинхронность.",
  "dispatch.begin":
    "Диспетчер достал сообщение. Разница с предыдущим этапом — время, которое оно пролежало в очереди. Это и есть цена асинхронной доставки.",
  "handler.invoke":
    "Диспетчер вызывает подписчиков события. Их может быть несколько; если один упадёт с паникой, остальные всё равно получат сообщение.",
  "publish(reply)":
    "Обработчик публикует ответ — обычное событие с тем же correlation_id. В этом примере он публикует его из отдельного потока после задержки, поэтому диспетчер во время ожидания свободен.",
  "correlation.match":
    "Ядро смотрит, ждёт ли кто-то событие с таким идентификатором. На запросе — промах: ждут ответ, а не запрос. Именно поэтому в ask нужен явный reply_topic.",
  "sink.emit":
    "Событие уходит в интерфейс. Здесь цепочка покидает Rust: дальше её видят подписчики Vue и журнал.",
  "ask.reply":
    "Ожидающий проснулся и вернул значение в интерфейс. Поток команды снова работает — с тем же значением, которое принесло событие-ответ.",
};

const current = ref<TraceChain | null>(null);
const shown = ref(0);
const selected = ref<number | null>(null);
const playing = ref(false);
const busy = ref(false);
const failed = ref("");

let unlisten: UnlistenFn | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

// ───────────────────────────── Проигрывание ─────────────────────────────

function stopTimer() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  playing.value = false;
}

/** Реальный зазор между этапами — по нему выбирается пауза проигрывания. */
function realGap(index: number): number {
  const stages = current.value?.stages ?? [];
  if (index <= 0) return 0;
  return stages[index].at_ms - stages[index - 1].at_ms;
}

function scheduleNext() {
  if (!playing.value || !current.value) return;
  if (shown.value >= current.value.stages.length) {
    playing.value = false;
    return;
  }
  // Обычный шаг — 700 мс; после настоящего ожидания пауза длиннее,
  // чтобы его успели заметить. Темп не претендует на реальное время.
  const gap = realGap(shown.value);
  const delay = gap >= 20 ? Math.min(2500, 700 + gap * 6) : 700;
  timer = setTimeout(revealNext, delay);
}

function revealNext() {
  if (!current.value) return;
  if (shown.value >= current.value.stages.length) {
    playing.value = false;
    return;
  }
  shown.value += 1;
  selected.value = shown.value - 1;
  scheduleNext();
}

function startPlayback() {
  stopTimer();
  shown.value = 0;
  selected.value = null;
  playing.value = true;
  timer = setTimeout(revealNext, 250);
}

function pause() {
  stopTimer();
}

function resume() {
  if (!current.value) return;
  if (shown.value >= current.value.stages.length) return;
  playing.value = true;
  scheduleNext();
}

function showAll() {
  if (!current.value) return;
  stopTimer();
  shown.value = current.value.stages.length;
  selected.value = current.value.stages.length - 1;
}

function select(index: number) {
  selected.value = index;
  if (playing.value) stopTimer();
}

// ───────────────────────────── Запуск прогона ─────────────────────────────

async function run() {
  if (busy.value) return;
  stopTimer();
  busy.value = true;
  failed.value = "";
  current.value = null;
  shown.value = 0;
  selected.value = null;

  write("ядро", "info", `учебный прогон: core:ping с задержкой ${DELAY_MS} мс`);

  try {
    // Настоящий запрос: ядро само взведёт запись на свой correlation_id.
    await askTraced("core:ping", "core:pong", { echo: "учебный прогон", delay_ms: DELAY_MS }, 5000);
  } catch (e) {
    failed.value = String(e);
  } finally {
    busy.value = false;
  }
}

function onTrace(chain: TraceChain) {
  current.value = chain;
  if (chain.outcome === "ok") {
    write("ядро", "result", `цепочка записана: ${chain.stages.length} этапов за ${chain.elapsed_ms.toFixed(1)} мс`);
  } else {
    write("ядро", "error", `прогон не завершился (${chain.outcome})`);
  }
  startPlayback();
}

onMounted(async () => {
  // Трасса приходит последним событием прогона. Подписка живёт вместе с модулем.
  unlisten = await subscribeEvent<TraceChain>("core:trace", onTrace);
});

onUnmounted(() => {
  stopTimer();
  unlisten?.();
});

// ───────────────────────────── Производные данные ─────────────────────────────

/** Все строки проигрывания: этапы плюс границы сообщений и ожидание. */
const rows = computed<Row[]>(() => {
  const chain = current.value;
  if (!chain) return [];

  const split = chain.stages.findIndex((stage) => stage.name === "publish(reply)");
  const result: Row[] = [];

  chain.stages.forEach((stage, index) => {
    if (index === 0) {
      result.push({ kind: "divider", title: "сообщение 1 · запрос", at: 0 });
    }
    if (index === split && split > 0) {
      const previous = chain.stages[index - 1];
      result.push({
        kind: "wait",
        ms: stage.at_ms - previous.at_ms,
        at: index,
      });
      result.push({ kind: "divider", title: "сообщение 2 · ответ", at: index });
    }
    result.push({ kind: "stage", stage, index, at: index + 1 });
  });

  return result;
});

const visibleRows = computed(() => rows.value.filter((row) => row.at <= shown.value));

const selectedStage = computed(() => {
  if (!current.value || selected.value === null) return null;
  return current.value.stages[selected.value] ?? null;
});

const selectedExplanation = computed(() => {
  const name = selectedStage.value?.name;
  return name ? (EXPLANATIONS[name] ?? "") : "";
});

const complete = computed(
  () => !!current.value && shown.value >= current.value.stages.length,
);

/** Настоящее ожидание ответа: разрыв между секциями. */
const waitMs = computed(() => {
  const chain = current.value;
  if (!chain) return 0;
  const split = chain.stages.findIndex((stage) => stage.name === "publish(reply)");
  if (split <= 0) return 0;
  return chain.stages[split].at_ms - chain.stages[split - 1].at_ms;
});

const workMs = computed(() => {
  const total = current.value?.elapsed_ms ?? 0;
  return Math.max(0, total - waitMs.value);
});

/** Ширина полос: пропорции условные, значения подписаны точно. */
const workWidth = computed(() => {
  const total = current.value?.elapsed_ms ?? 0;
  if (total <= 0 || waitMs.value <= 0) return "100%";
  const share = (workMs.value / total) * 100;
  return `${Math.min(92, Math.max(8, share))}%`;
});

const waitWidth = computed(() => {
  if (waitMs.value <= 0) return "0%";
  return `${100 - Number.parseFloat(workWidth.value)}%`;
});

const actorOf = (name: string) => ACTORS[name] ?? { key: "bus", label: "ядро" };

const outcomeText = computed(() => {
  switch (current.value?.outcome) {
    case "ok":
      return "ответ получен";
    case "timeout":
      return "таймаут";
    case "error":
      return "ошибка";
    default:
      return "";
  }
});

const badgeText = computed(() => {
  if (busy.value) return "идёт запрос";
  if (playing.value) return "проигрывание";
  if (complete.value) return "цепочка записана";
  if (current.value) return "пауза";
  return "готов к прогону";
});
</script>

<template>
  <section class="module">
    <header class="module__header">
      <div>
        <h1>Как работает шина</h1>
        <p class="module__subtitle">
          Один настоящий запрос <code>core:ping</code> через настоящую шину — с паузами и пояснениями.
        </p>
      </div>
      <span class="badge" :class="{ 'badge--ok': complete }">{{ badgeText }}</span>
    </header>

    <div class="controls">
      <button class="btn btn--primary" :disabled="busy" @click="run">
        {{ current ? "Показать заново" : "Показать маршрут" }}
      </button>
      <button v-if="current && !complete" class="btn btn--ghost" @click="playing ? pause() : resume()">
        {{ playing ? "Пауза" : "Продолжить" }}
      </button>
      <button v-if="current && !complete" class="btn btn--ghost" @click="showAll">
        Показать всё
      </button>
      <span class="controls__hint">задержка ответа {{ DELAY_MS }} мс — настоящая</span>
    </div>

    <p v-if="failed" class="error">{{ failed }}</p>

    <article v-if="current" class="chain">
      <header class="chain__head">
        <div class="chain__route">
          <code>{{ current.topic }}</code>
          <span class="chain__arrow">→</span>
          <code>{{ current.reply_topic }}</code>
        </div>
        <div class="chain__meta">
          <span>{{ current.stages.length }} этапов</span>
          <span>{{ current.elapsed_ms.toFixed(1) }} мс</span>
          <span class="chain__outcome" :class="`chain__outcome--${current.outcome}`">
            {{ outcomeText }}
          </span>
        </div>
      </header>

      <div v-if="complete" class="overview">
        <div class="overview__bar">
          <div class="overview__work" :style="{ width: workWidth }"></div>
          <div class="overview__wait" :style="{ width: waitWidth }"></div>
        </div>
        <div class="overview__legend">
          <span>работа ядра {{ workMs.toFixed(1) }} мс</span>
          <span>ожидание ответа {{ waitMs.toFixed(1) }} мс</span>
          <span class="overview__note">пропорции условные, значения точные</span>
        </div>
      </div>

      <div class="timeline">
        <template v-for="row in visibleRows" :key="`${row.kind}-${row.at}`">
          <div v-if="row.kind === 'divider'" class="divider">{{ row.title }}</div>

          <div v-else-if="row.kind === 'wait'" class="wait">
            <span class="wait__line"></span>
            <span class="wait__label">
              ожидание ответа {{ (row.ms ?? 0).toFixed(1) }} мс · диспетчер свободен
              <span v-if="playing" class="wait__dot"></span>
            </span>
            <span class="wait__line"></span>
          </div>

          <button
            v-else
            type="button"
            class="stage"
            :class="{ 'stage--active': selected === row.index }"
            @click="select(row.index ?? 0)"
          >
            <span class="stage__actor" :class="`stage__actor--${actorOf(row.stage?.name ?? '').key}`">
              {{ actorOf(row.stage?.name ?? "").label }}
            </span>
            <span class="stage__name">{{ row.stage?.name }}</span>
            <span class="stage__time">{{ (row.stage?.at_ms ?? 0).toFixed(2) }} мс</span>
            <span class="stage__detail">{{ row.stage?.detail ?? row.stage?.topic }}</span>
          </button>
        </template>
      </div>

      <aside v-if="selectedStage" class="explain">
        <div class="explain__head">
          <span
            class="stage__actor"
            :class="`stage__actor--${actorOf(selectedStage.name).key}`"
          >
            {{ actorOf(selectedStage.name).label }}
          </span>
          <strong>{{ selectedStage.name }}</strong>
          <span class="explain__step">
            шаг {{ (selected ?? 0) + 1 }} из {{ current.stages.length }}
          </span>
        </div>
        <p class="explain__text">{{ selectedExplanation }}</p>
      </aside>
    </article>

    <p v-else class="empty">
      Нажми «Показать маршрут» — уйдёт настоящий запрос, а ядро запишет его путь.
    </p>
  </section>
</template>

<style scoped>
/* Шкала как в главном модуле: 28 / 15 / 14 / 13, отступы кратны 8. */
.module {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.module__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.module__header h1 {
  margin: 0 0 8px;
  font-size: 28px;
  line-height: 1.25;
}

.module__subtitle {
  margin: 0;
  color: var(--text-muted);
  font-size: 15px;
}

.badge {
  padding: 7px 14px;
  border-radius: 999px;
  border: 1px solid var(--border);
  font-size: 13px;
  white-space: nowrap;
}

.badge--ok {
  color: #7ee2a8;
  border-color: rgba(126, 226, 168, 0.4);
  background: rgba(126, 226, 168, 0.1);
}

.controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.controls__hint {
  color: var(--text-muted);
  font-size: 13px;
}

.chain {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 24px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
}

.chain__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.chain__route {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 15px;
}

.chain__arrow {
  color: var(--text-muted);
}

.chain__meta {
  display: flex;
  align-items: baseline;
  gap: 16px;
  color: var(--text-muted);
  font-size: 13px;
}

.chain__outcome--ok {
  color: #7ee2a8;
}

.chain__outcome--timeout,
.chain__outcome--error {
  color: #ff9b9b;
}

/* Обзор: реальный масштаб, но с минимальной шириной работы,
   иначе она схлопнулась бы в точку. Об этом честно написано в подписи. */
.overview {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.overview__bar {
  display: flex;
  height: 14px;
  border-radius: 7px;
  overflow: hidden;
  background: var(--surface-2);
}

.overview__work {
  background: #7ee2a8;
}

.overview__wait {
  background: repeating-linear-gradient(
    135deg,
    #3a4150,
    #3a4150 6px,
    #2a2f3a 6px,
    #2a2f3a 12px
  );
}

.overview__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  color: var(--text-muted);
  font-size: 12px;
}

.overview__note {
  margin-left: auto;
  opacity: 0.7;
}

.timeline {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.divider {
  margin: 8px 0 2px;
  color: var(--text-muted);
  font-size: 12px;
  letter-spacing: 0.4px;
  text-transform: uppercase;
}

.wait {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0;
  color: var(--text-muted);
  font-size: 12px;
}

.wait__line {
  flex: 1;
  height: 1px;
  background: repeating-linear-gradient(
    90deg,
    var(--border),
    var(--border) 4px,
    transparent 4px,
    transparent 8px
  );
}

.wait__label {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.wait__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  animation: pulse 1s infinite;
}

@keyframes pulse {
  50% {
    opacity: 0.25;
  }
}

/* Этап — кнопка: по клику показывается пояснение и проигрывание встаёт. */
.stage {
  display: grid;
  grid-template-columns: 84px 148px 72px minmax(0, 1fr);
  gap: 12px;
  align-items: baseline;
  width: 100%;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.stage:hover {
  background: var(--surface-2);
}

.stage--active {
  border-color: var(--accent);
  background: rgba(91, 140, 255, 0.1);
}

.stage__actor {
  padding: 1px 6px;
  border-radius: 5px;
  font-size: 11px;
  text-align: center;
  text-transform: lowercase;
}

.stage__actor--ui {
  background: rgba(91, 140, 255, 0.18);
  color: #a9c2ff;
}

.stage__actor--bus {
  background: rgba(180, 139, 255, 0.18);
  color: #cbb0ff;
}

.stage__actor--dispatcher {
  background: rgba(255, 184, 107, 0.16);
  color: #ffcb92;
}

.stage__actor--module {
  background: rgba(126, 226, 168, 0.16);
  color: #a5edc3;
}

.stage__actor--bridge {
  background: rgba(100, 210, 255, 0.16);
  color: #9ae2ff;
}

.stage__name {
  font-family: var(--font-mono);
  font-size: 12px;
}

.stage__time {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 11px;
  text-align: right;
}

.stage__detail {
  min-width: 0;
  color: var(--text-muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.explain {
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
}

.explain__head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 6px;
  font-size: 14px;
}

.explain__step {
  margin-left: auto;
  color: var(--text-muted);
  font-size: 12px;
}

.explain__text {
  margin: 0;
  color: var(--text);
  font-size: 14px;
  line-height: 1.55;
}

.empty {
  color: var(--text-muted);
  font-size: 14px;
}

.error {
  margin: 0;
  color: #ff9b9b;
  font-size: 14px;
}
</style>

<script setup lang="ts">
// Панель инструмента Ping.
//
// Смысл прежнего экрана «Как работает шина» сохранён: кнопка отправляет
// настоящий `ask`, ядро записывает этапы цепочки, интерфейс показывает весь
// путь сразу, а пояснение к этапу раскрывается по клику.
//
// Мост, подписки и состояния операций живут в `api.ts` и `usePing.ts`;
// здесь только разметка и тексты.

import Button from "primevue/button";
import InputText from "primevue/inputtext";
import { computed, nextTick, onMounted, onUnmounted } from "vue";
import type { ComponentPublicInstance } from "vue";
import { usePing } from "./usePing";

/** Кто действует на этапе: подпись этапа. */
const ACTORS: Record<string, string> = {
  "ask.start": "интерфейс",
  "route.decode": "шина",
  "queue.enqueue": "шина",
  "dispatch.begin": "диспетчер",
  "handler.invoke": "модуль",
  "publish(reply)": "модуль",
  "correlation.match": "диспетчер",
  "sink.emit": "мост",
  "ask.reply": "интерфейс",
};

/** Пояснение к этапу — то, ради чего прогон вообще показывается. */
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
    "Обработчик публикует ответ — обычное событие с тем же correlation_id. Здесь он публикует его из отдельного потока после задержки, поэтому диспетчер во время ожидания свободен.",
  "correlation.match":
    "Ядро смотрит, ждёт ли кто-то событие с таким идентификатором. На запросе — промах: ждут ответ, а не запрос. Именно поэтому в ask нужен явный reply_topic.",
  "sink.emit":
    "Событие уходит в интерфейс. Здесь цепочка покидает Rust: дальше её видят подписчики Vue и журнал.",
  "ask.reply":
    "Ожидающий проснулся и вернул значение в интерфейс. Поток команды снова работает — с тем же значением, которое принесло событие-ответ.",
};

type BadgeTone = "muted" | "ok";

const {
  echo,
  status,
  reply,
  elapsedMs,
  chain,
  rows,
  selectedStage,
  checkBus,
  showPath,
  toggle,
  start,
  stop,
} = usePing();

/** Короткое состояние для метки в шапке. */
const badge = computed<{ text: string; tone: BadgeTone }>(() => {
  if (status.ping.loading) return { text: "идёт запрос", tone: "muted" };
  if (status.trace.loading) return { text: "идёт прогон", tone: "muted" };
  if (chain.value) return { text: "путь записан", tone: "ok" };
  if (reply.value) return { text: "ответ получен", tone: "ok" };
  return { text: "готов", tone: "muted" };
});

const outcomeText = computed(() => {
  switch (chain.value?.outcome) {
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

const outcomeTone = computed<string>(() => {
  switch (chain.value?.outcome) {
    case "ok":
      return "ok";
    case "timeout":
      return "warn";
    default:
      return "danger";
  }
});

function actorOf(name: string): string {
  return ACTORS[name] ?? "ядро";
}

function explanationOf(name: string): string {
  return EXPLANATIONS[name] ?? "";
}

/** Раскрытые карточки по номеру этапа: `ref` внутри `v-for` собирается в массив. */
const explainBoxes = new Map<number, HTMLElement>();

function keepExplain(el: Element | ComponentPublicInstance | null, index: number): void {
  if (el instanceof HTMLElement) explainBoxes.set(index, el);
  else explainBoxes.delete(index);
}

/** Клик по этапу: пояснение раскрывается под ним и не остаётся за краем. */
async function choose(index: number): Promise<void> {
  toggle(index);
  await nextTick();
  if (!selectedStage.value) return;
  explainBoxes.get(index)?.scrollIntoView({ block: "nearest" });
}

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString();
}

onMounted(() => {
  void start();
});

onUnmounted(() => {
  stop();
});
</script>

<template>
  <section class="ping">
    <header class="ping__head">
      <div class="ping__heading">
        <h1 class="ping__title">Ping</h1>
        <p class="ping__lead">
          Самопроверка шины: настоящий запрос <code>core:ping</code> и ответ
          <code>core:pong</code>.
        </p>
      </div>
      <span class="ping__badge">
        <i class="ping__badge-dot" :class="`ping__badge-dot--${badge.tone}`" />
        {{ badge.text }}
      </span>
    </header>

    <div class="ping__form">
      <InputText
        v-model="echo"
        class="ping__input"
        size="small"
        aria-label="Текст сообщения"
        placeholder="Текст для echo"
        :disabled="status.ping.loading || status.trace.loading"
        @keyup.enter="checkBus"
      />
      <Button
        label="Проверить шину"
        icon="pi pi-bolt"
        size="small"
        :loading="status.ping.loading"
        @click="checkBus"
      />
      <Button
        label="Показать путь"
        icon="pi pi-share-alt"
        severity="secondary"
        outlined
        size="small"
        :loading="status.trace.loading"
        @click="showPath"
      />
    </div>

    <p v-if="status.ping.error" class="ping__error">
      <i class="pi pi-exclamation-circle" aria-hidden="true" />
      {{ status.ping.error }}
    </p>
    <p v-if="status.trace.error" class="ping__error">
      <i class="pi pi-exclamation-circle" aria-hidden="true" />
      {{ status.trace.error }}
    </p>

    <section v-if="reply" class="reply">
      <h2 class="ping__section-title">Ответ</h2>

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
          <dt>Момент ответа</dt>
          <dd>{{ formatTime(reply.at) }}</dd>
        </div>
        <div v-if="elapsedMs !== null" class="reply__fact">
          <dt>Круговое время</dt>
          <dd>{{ elapsedMs.toFixed(1) }} мс</dd>
        </div>
      </dl>

      <p class="ping__note">
        Запрос и ответ — события шины. Интерфейс ждёт ответ только по
        <code>correlation_id</code>; второй подписчик видит тот же
        <code>core:pong</code> в журнале.
      </p>
    </section>

    <section v-if="chain" class="route">
      <header class="route__head">
        <h2 class="ping__section-title">Путь сообщения</h2>
        <div class="route__meta">
          <span>{{ chain.stages.length }} этапов</span>
          <span>{{ chain.elapsed_ms.toFixed(1) }} мс</span>
          <span class="route__outcome" :class="`route__outcome--${outcomeTone}`">
            {{ outcomeText }}
          </span>
        </div>
      </header>

      <ol class="route__list">
        <template v-for="row in rows" :key="`${row.kind}-${row.at}`">
          <li v-if="row.kind === 'divider'" class="route__divider">{{ row.title }}</li>

          <li v-else-if="row.kind === 'wait'" class="route__wait">
            ожидание ответа {{ (row.ms ?? 0).toFixed(1) }} мс · диспетчер свободен
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
              <span class="route__time">{{ (row.stage?.at_ms ?? 0).toFixed(2) }} мс</span>
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
  </section>
</template>

<style scoped>
.ping {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-xl);
}

.ping__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ag-space-lg);
}

.ping__heading {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  gap: var(--ag-space-sm);
}

.ping__title {
  margin: 0;
  font-size: var(--ag-text-xl);
  line-height: 1.25;
}

.ping__lead {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-md);
}

.ping__badge {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: var(--ag-space-sm);
  padding-top: var(--ag-space-sm);
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.ping__badge-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--ag-radius-round);
  background: currentColor;
}

.ping__badge-dot--ok {
  background: var(--ag-ok);
}

.ping__lead code,
.ping__note code {
  font-family: var(--ag-font-mono);
  font-size: var(--ag-text-xs);
}

.ping__form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ag-space-sm) var(--ag-space-lg);
}

.ping__input {
  width: var(--ag-field-width);
}

.ping__error {
  display: flex;
  align-items: center;
  gap: var(--ag-space-sm);
  margin: 0;
  color: var(--ag-danger);
  font-size: var(--ag-text-sm);
}

.ping__section-title {
  margin: 0;
  font-size: var(--ag-text-lg);
  font-weight: 600;
}

.ping__note {
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

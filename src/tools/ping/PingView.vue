<script setup lang="ts">
// Панель инструмента Ping.
//
// Смысл прежнего экрана «Как работает шина» сохранён: кнопка отправляет
// настоящий `ask`, ядро записывает этапы цепочки, интерфейс показывает их
// по одному с пояснениями. Данные настоящие, темп показа искусственный —
// иначе девять этапов мелькнули бы за доли миллисекунды и ничего не объяснили.
//
// Мост, подписки и состояния операций живут в `api.ts` и `usePing.ts`;
// здесь только разметка и тексты.

import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Tag from "primevue/tag";
import { computed, onMounted, onUnmounted } from "vue";
import { usePing } from "./usePing";

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

type TagSeverity = "secondary" | "success" | "info" | "warn" | "danger" | "contrast";

const {
  echo,
  status,
  reply,
  elapsedMs,
  chain,
  visibleRows,
  selectedStage,
  complete,
  checkBus,
  showPath,
  select,
  showAll,
  start,
  stop,
} = usePing();

/** Короткое состояние для метки в шапке. */
const badge = computed<{ text: string; severity: TagSeverity }>(() => {
  if (status.ping.loading) return { text: "идёт запрос", severity: "info" };
  if (status.trace.loading) return { text: "идёт прогон", severity: "info" };
  if (complete.value) return { text: "путь записан", severity: "success" };
  if (reply.value) return { text: "ответ получен", severity: "success" };
  return { text: "готов", severity: "secondary" };
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

const outcomeSeverity = computed<TagSeverity>(() => {
  switch (chain.value?.outcome) {
    case "ok":
      return "success";
    case "timeout":
      return "warn";
    default:
      return "danger";
  }
});

function actorOf(name: string): { key: string; label: string } {
  return ACTORS[name] ?? { key: "bus", label: "ядро" };
}

function explanationOf(name: string): string {
  return EXPLANATIONS[name] ?? "";
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
      <Tag :value="badge.text" :severity="badge.severity" />
    </header>

    <div class="ping__form">
      <InputText
        v-model="echo"
        class="ping__input"
        aria-label="Текст сообщения"
        placeholder="Текст для echo"
        :disabled="status.ping.loading || status.trace.loading"
        @keyup.enter="checkBus"
      />
      <Button
        label="Проверить шину"
        icon="pi pi-bolt"
        :loading="status.ping.loading"
        @click="checkBus"
      />
      <Button
        label="Показать путь"
        icon="pi pi-share-alt"
        severity="secondary"
        outlined
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
          <Tag :value="outcomeText" :severity="outcomeSeverity" />
        </div>
      </header>

      <ol class="route__list">
        <template v-for="row in visibleRows" :key="`${row.kind}-${row.at}`">
          <li v-if="row.kind === 'divider'" class="route__divider">{{ row.title }}</li>

          <li v-else-if="row.kind === 'wait'" class="route__wait">
            ожидание ответа {{ (row.ms ?? 0).toFixed(1) }} мс · диспетчер свободен
          </li>

          <li v-else>
            <button
              class="route__stage"
              :class="{ 'route__stage--active': selectedStage === row.stage }"
              type="button"
              @click="select(row.index ?? 0)"
            >
              <span
                class="route__actor"
                :class="`route__actor--${actorOf(row.stage?.name ?? '').key}`"
              >
                {{ actorOf(row.stage?.name ?? "").label }}
              </span>
              <code class="route__name">{{ row.stage?.name }}</code>
              <span class="route__time">{{ (row.stage?.at_ms ?? 0).toFixed(2) }} мс</span>
            </button>
          </li>
        </template>
      </ol>

      <div v-if="!complete" class="route__actions">
        <Button label="Показать всё" text size="small" @click="showAll" />
      </div>

      <article v-if="selectedStage" class="route__explain">
        <h3 class="route__explain-title">{{ selectedStage.name }}</h3>
        <p class="route__explain-text">{{ explanationOf(selectedStage.name) }}</p>
      </article>
    </section>
  </section>
</template>

<style scoped>
.ping {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.ping__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.ping__heading {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ping__title {
  margin: 0;
  font-size: 28px;
  line-height: 1.25;
}

.ping__lead {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 15px;
}

.ping__lead code,
.ping__note code {
  font-family: var(--ag-font-mono);
  font-size: 13px;
}

.ping__form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}

.ping__input {
  width: 240px;
}

.ping__error {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--p-red-400);
  font-size: 14px;
}

.ping__section-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.ping__note {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 14px;
  line-height: 1.55;
}

.reply {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.reply__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin: 0;
}

.reply__fact {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px;
  border: 1px solid var(--p-surface-700);
  border-radius: 8px;
  background: var(--p-surface-950);
}

.reply__fact dt {
  color: var(--p-text-muted-color);
  font-size: 13px;
}

.reply__fact dd {
  margin: 0;
  font-size: 14px;
  overflow-wrap: anywhere;
}

.mono {
  font-family: var(--ag-font-mono);
  font-size: 13px;
}

.route {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.route__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.route__meta {
  display: flex;
  align-items: center;
  gap: 16px;
  color: var(--p-text-muted-color);
  font-size: 13px;
}

.route__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.route__divider {
  padding: 8px 0;
  color: var(--p-text-muted-color);
  font-size: 13px;
  letter-spacing: 0.4px;
  text-transform: uppercase;
}

.route__wait {
  padding: 8px;
  color: var(--p-text-muted-color);
  font-size: 13px;
  text-align: center;
}

.route__stage {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  padding: 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--p-text-color);
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.route__stage:hover {
  background: var(--p-surface-800);
}

.route__stage--active {
  border-color: var(--p-surface-600);
  background: var(--p-surface-800);
}

.route__stage:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.route__actor {
  flex-shrink: 0;
  width: 104px;
  color: var(--p-text-muted-color);
  font-size: 13px;
}

.route__actor--ui {
  color: var(--p-primary-color);
}

.route__actor--dispatcher {
  color: var(--p-orange-400);
}

.route__actor--module {
  color: var(--p-green-400);
}

.route__actor--bridge {
  color: var(--p-purple-400);
}

.route__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-family: var(--ag-font-mono);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.route__time {
  flex-shrink: 0;
  color: var(--p-text-muted-color);
  font-family: var(--ag-font-mono);
  font-size: 13px;
}

.route__actions {
  display: flex;
}

.route__explain {
  padding: 16px;
  border: 1px solid var(--p-surface-700);
  border-radius: 8px;
  background: var(--p-surface-950);
}

.route__explain-title {
  margin: 0 0 8px;
  font-family: var(--ag-font-mono);
  font-size: 13px;
  font-weight: 600;
}

.route__explain-text {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 14px;
  line-height: 1.55;
}
</style>

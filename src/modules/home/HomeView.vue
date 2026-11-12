<script setup lang="ts">
// Главный модуль-витрина: показывает, что ядро живо, и даёт две кнопки —
// самопроверку шины и завершение приложения.
//
// Здесь же видно разделение примитивов:
// * самопроверка — это `ask` (запрос/ответ поверх событий);
// * завершение — это команда (синхронная, один владелец, ошибка возвращается).

import { onMounted, onUnmounted, ref } from "vue";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { ask, invokeCommand, subscribeEvent } from "../../core/bus";
import { journal, write } from "../../core/journal";

interface Pong {
  echo: string | null;
  at: number;
  correlation_id: string | null;
}

/** Ответ Rust о запуске: путь к логу и действующий уровень. */
interface StartupStatus {
  blocked: boolean;
  root: string;
  reason: string | null;
  log_path: string;
  log_level: string;
}

/** Уровни ровно те, что понимает ядро: `trace` нет по решению (ADR 0004). */
const LEVELS = ["error", "warn", "info", "debug"] as const;

const echo = ref("привет, ядро");
const busy = ref(false);
const lastPong = ref<Pong | null>(null);
const error = ref("");

const startup = ref<StartupStatus | null>(null);
const logLevel = ref<string>("info");
/** Действующий уровень: к нему возвращаемся, если сохранить не удалось. */
let savedLevel = "info";

let unlisten: UnlistenFn | null = null;

// Подписка создаётся при каждом открытии экрана и снимается при уходе —
// иначе обработчик пережил бы компонент. Но сам факт «подписка активна»
// относится к запуску приложения, а не к посещению экрана: писать его
// в журнал каждый раз — значит забивать историю одной и той же строкой.
let announced = false;

async function ping() {
  busy.value = true;
  error.value = "";
  write("ping", "info", `запрос core:ping отправлен, echo=«${echo.value}»`);
  try {
    // `ask` сам добавит correlation_id и дождётся ответа `core:pong`.
    const reply = await ask<Pong>("core:ping", "core:pong", { echo: echo.value });
    lastPong.value = reply;
    write(
      "ping",
      "result",
      `ответ получен: echo=«${reply.echo ?? "—"}», correlation=${reply.correlation_id ?? "—"}`,
    );
  } catch (e) {
    error.value = String(e);
    write("ping", "error", `запрос не выполнен: ${String(e)}`);
  } finally {
    busy.value = false;
  }
}

// Временная кнопка для проверки вида журнала: это настоящий отказ шины,
// а не имитация. Удалить, когда вид журнала будет утверждён.
async function failDemo() {
  write("ping", "info", "запрос в несуществующий топик core:no:such");
  try {
    await ask("core:no:such", "core:pong", {});
  } catch (e) {
    write("ping", "error", `отказ шины: ${String(e)}`);
  }
}

async function quit() {
  write("ядро", "info", "команда app:quit отправлена");
  try {
    // Команда синхронная: ошибка ядра всплывёт здесь же.
    await invokeCommand("app:quit");
  } catch (e) {
    error.value = String(e);
    write("ядро", "error", `команда не выполнена: ${String(e)}`);
  }
}

/** Меняет уровень лога на лету и сохраняет его в `settings.json`. */
async function applyLevel() {
  try {
    await invoke("set_log_level", { level: logLevel.value });
    savedLevel = logLevel.value;
    write("ядро", "info", `уровень лога: ${logLevel.value}`);
  } catch (e) {
    write("ядро", "error", `уровень лога не изменён: ${String(e)}`);
    logLevel.value = savedLevel;
  }
}

onMounted(async () => {
  // Путь к логу и действующий уровень нужны для подписи внизу экрана.
  try {
    startup.value = await invoke<StartupStatus>("startup_status");
    logLevel.value = startup.value.log_level;
    savedLevel = startup.value.log_level;
  } catch {
    // Вне Tauri статуса нет: подпись просто останется пустой.
  }

  // Параллельная подписка на то же событие-ответ демонстрирует,
  // что у события может быть много независимых наблюдателей.
  unlisten = await subscribeEvent<Pong>("core:pong", (payload) => {
    write("мост", "info", `перехвачено событие core:pong: at=${payload.at}`);
  });
  if (!announced) {
    announced = true;
    write("мост", "info", "подписка на core:pong активна");
  }
});

onUnmounted(() => {
  // Без отписки обработчик переживёт компонент и будет удерживать ссылки.
  unlisten?.();
});
</script>

<template>
  <section class="module">
    <header class="module__header">
      <div>
        <h1>Состояние ядра</h1>
        <p class="module__subtitle">
          Шина сообщений, контейнер зависимостей и мост в интерфейс работают.
        </p>
      </div>
      <span class="badge" :class="lastPong ? 'badge--ok' : 'badge--idle'">
        {{ lastPong ? "шина отвечает" : "ожидание проверки" }}
      </span>
    </header>

    <div class="grid">
      <article class="card">
        <h2>Самопроверка</h2>
        <p class="muted">
          Запрос <code>core:ping</code> уходит в шину, обработчик модуля публикует
          <code>core:pong</code>. Ответ приходит по <code>correlation_id</code>.
        </p>

        <label class="field">
          <span>Эхо-сообщение</span>
          <input v-model="echo" type="text" placeholder="что вернуть в ответе" />
        </label>

        <div class="actions">
          <button class="btn btn--primary" :disabled="busy" @click="ping">
            {{ busy ? "Ждём ответ…" : "Проверить шину" }}
          </button>
          <button class="btn btn--ghost" :disabled="busy" @click="failDemo">
            Проверить отказ
          </button>
        </div>

        <p v-if="error" class="error">{{ error }}</p>

        <dl v-if="lastPong" class="facts">
          <div>
            <dt>Эхо</dt>
            <dd>{{ lastPong.echo ?? "—" }}</dd>
          </div>
          <div>
            <dt>Время ответа</dt>
            <dd>{{ new Date(lastPong.at).toLocaleTimeString() }}</dd>
          </div>
          <div>
            <dt>Correlation ID</dt>
            <dd class="mono">{{ lastPong.correlation_id ?? "—" }}</dd>
          </div>
        </dl>
      </article>

      <article class="card">
        <h2>Журнал</h2>
        <p class="muted">
          Факты о работе подсистем. Хранится в интерфейсе и переживает переключение модулей.
        </p>
        <ul v-if="journal.entries.length" class="log">
          <li
            v-for="entry in journal.entries"
            :key="entry.id"
            class="log__row"
            :class="`log__row--${entry.kind}`"
          >
            <time class="log__time">{{ new Date(entry.at).toLocaleTimeString() }}</time>
            <span class="log__source">{{ entry.source }}</span>
            <span class="log__text">{{ entry.text }}</span>
          </li>
        </ul>
        <p v-else class="muted">Пока пусто.</p>
      </article>
    </div>

    <section class="diagnostics">
      <div class="diagnostics__info">
        <h3>Файл лога</h3>
        <p class="muted">
          Сюда попадают только отказы приложения и его механизмов. Работа
          модулей остаётся в журнале.
        </p>
        <code class="diagnostics__path">{{ startup?.log_path || "лог не запущен" }}</code>
      </div>
      <label class="field field--inline">
        <span>Уровень лога</span>
        <select v-model="logLevel" @change="applyLevel">
          <option v-for="level in LEVELS" :key="level" :value="level">{{ level }}</option>
        </select>
      </label>
    </section>

    <footer class="module__footer">
      <div>
        <h3>Завершение приложения</h3>
        <p class="muted">
          Это команда <code>app:quit</code>: выполняется синхронно и ровно один раз.
        </p>
      </div>
      <button class="btn btn--danger" @click="quit">Выйти</button>
    </footer>
  </section>
</template>

<style scoped>
/* Шкала: заголовок 28 / подзаголовок 15 / текст 14 / подпись 13.
   Отступы кратны 8: 16 внутри групп, 24 между блоками, 32 по краям. */
.module {
  display: flex;
  flex-direction: column;
  gap: 24px;
  height: 100%;
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
  font-size: 13px;
  white-space: nowrap;
  border: 1px solid var(--border);
}

.badge--ok {
  color: #7ee2a8;
  border-color: rgba(126, 226, 168, 0.4);
  background: rgba(126, 226, 168, 0.1);
}

.badge--idle {
  color: var(--text-muted);
}

.grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  gap: 20px;
  /* Карточки занимают свою высоту, а не растягиваются на всю строку. */
  align-items: start;
}

@media (max-width: 900px) {
  .grid {
    grid-template-columns: 1fr;
  }
}

.card {
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
}

.card h2 {
  margin: 0 0 10px;
  font-size: 18px;
}

.muted {
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.55;
  margin: 0;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 20px 0;
  font-size: 14px;
  color: var(--text-muted);
}

/* Горизонтальное поле: подпись слева от списка, без вертикальных отступов. */
.field--inline {
  flex-direction: row;
  align-items: center;
  gap: 12px;
  margin: 0;
}

button.btn {
  margin-top: 4px;
}

.facts {
  display: grid;
  gap: 12px;
  margin: 20px 0 0;
}

.facts div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--border);
}

.facts dt {
  color: var(--text-muted);
  font-size: 14px;
}

.facts dd {
  margin: 0;
  font-size: 14px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.log {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 320px;
  overflow: auto;
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-muted);
}

/* Строка журнала: время, источник, текст. Источник — узкий ярлык,
   чтобы тексты не съезжали вправо при разной длине имён модулей. */
.log__row {
  display: grid;
  grid-template-columns: 64px 56px minmax(0, 1fr);
  gap: 8px;
  align-items: baseline;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}

.log__time {
  font-family: var(--font-mono);
  font-size: 12px;
  opacity: 0.75;
}

.log__source {
  padding: 1px 0;
  border-radius: 4px;
  background: var(--surface-2);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.3px;
  text-align: center;
  text-transform: lowercase;
}

.log__text {
  min-width: 0;
  overflow-wrap: anywhere;
}

/* Вид записи: результат и отказ должны читаться без разбора текста. */
.log__row--result .log__text {
  color: #7ee2a8;
}

.log__row--error .log__text {
  color: #ff9b9b;
}

.error {
  margin-top: 16px;
  color: #ff9b9b;
  font-size: 14px;
}

/* Лог и журнал рядом, но не вместе: подпись к файлу отвечает на вопрос
   «куда смотреть после поломки», а не показывает содержимое. */
.diagnostics {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  padding: 20px 24px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
}

.diagnostics h3 {
  margin: 0 0 4px;
  font-size: 16px;
}

.diagnostics__path {
  display: inline-block;
  margin-top: 8px;
  font-size: 12px;
}

/* Блок завершения идёт сразу за карточками в общем потоке.
   `margin-top: auto` здесь был ошибкой: он прижимал его к низу окна
   и оставлял пустую дыру между карточками и кнопкой «Выйти». */
.module__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  padding: 20px 24px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
}

.module__footer h3 {
  margin: 0 0 4px;
  font-size: 16px;
}

.mono {
  font-family: var(--font-mono);
  font-size: 13px;
}
</style>

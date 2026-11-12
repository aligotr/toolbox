// Состояние инструмента Ping.
//
// Две операции независимы: обычная самопроверка и учебный прогон со записью
// этапов. Поэтому и состояния два — `status.ping` и `status.trace`, а не один
// общий `loading` (правила Vue). Компонент только показывает то, что здесь
// уже разложено; транспорт целиком в `api.ts`.
//
// Цепочка показывается целиком: настоящий путь длится доли миллисекунды,
// поэтому его разбор идёт не темпом, а пояснениями по клику.

import { computed, reactive, ref } from "vue";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { write } from "../../core/journal";
import { onPong, onTrace, ping, tracedPing, type Pong, type TraceChain, type TraceStage } from "./api";

/** Сообщение по умолчанию: его видно в панели до первого запроса. */
const DEFAULT_ECHO = "привет, ядро";

/** Показательная задержка ответа: настоящая, выполняется в отдельном потоке ядра. */
const TRACE_DELAY_MS = 120;

/** Строка маршрута: этап, граница сообщения или настоящее ожидание. */
interface RouteRow {
  kind: "stage" | "divider" | "wait";
  /** Порядковый номер строки: ключ для разметки. */
  at: number;
  index?: number;
  stage?: TraceStage;
  title?: string;
  ms?: number;
}

/** Состояние одной операции. */
interface OperationStatus {
  loading: boolean;
  error: string | null;
}

export function usePing() {
  const echo = ref(DEFAULT_ECHO);

  const status = reactive<{ ping: OperationStatus; trace: OperationStatus }>({
    ping: { loading: false, error: null },
    trace: { loading: false, error: null },
  });

  const reply = ref<Pong | null>(null);
  const elapsedMs = ref<number | null>(null);

  const chain = ref<TraceChain | null>(null);
  const selected = ref<number | null>(null);

  let unlistenPong: UnlistenFn | null = null;
  let unlistenTrace: UnlistenFn | null = null;

  /**
   * Подписки живут вместе с открытой панелью.
   *
   * Поток `core:pong` показывается в журнале: так видно, что у события
   * несколько независимых наблюдателей, а не только ожидающий `ask`.
   */
  async function start(): Promise<void> {
    try {
      unlistenPong = await onPong((payload) => {
        write("ping", "info", `второй подписчик получил core:pong: at=${payload.at}`);
      });
      unlistenTrace = await onTrace(handleTrace);
    } catch (error) {
      stop();
      status.trace.error = `подписка на события не создана: ${String(error)}`;
      write("ping", "error", `подписка на события не создана: ${String(error)}`);
    }
  }

  function stop(): void {
    unlistenPong?.();
    unlistenTrace?.();
    unlistenPong = null;
    unlistenTrace = null;
  }

  /** Обычная самопроверка: запрос и ответ без искусственной задержки. */
  async function checkBus(): Promise<void> {
    if (status.ping.loading) return;

    status.ping.loading = true;
    status.ping.error = null;
    write("ping", "info", `запрос core:ping отправлен, echo=«${echo.value}»`);

    const started = performance.now();
    try {
      const answer = await ping(echo.value);
      reply.value = answer;
      elapsedMs.value = performance.now() - started;
      write(
        "ping",
        "result",
        `ответ получен: echo=«${answer.echo ?? "—"}», correlation=${answer.correlation_id ?? "—"}`,
      );
    } catch (error) {
      status.ping.error = String(error);
      write("ping", "error", `запрос не выполнен: ${String(error)}`);
    } finally {
      status.ping.loading = false;
    }
  }

  /** Учебный прогон: ядро записывает цепочку и присылает её событием. */
  async function showPath(): Promise<void> {
    if (status.trace.loading) return;

    status.trace.loading = true;
    status.trace.error = null;
    chain.value = null;
    selected.value = null;
    write("ping", "info", `учебный прогон: core:ping с задержкой ${TRACE_DELAY_MS} мс`);

    try {
      await tracedPing(echo.value, TRACE_DELAY_MS);
    } catch (error) {
      status.trace.error = String(error);
      write("ping", "error", `прогон не выполнен: ${String(error)}`);
    } finally {
      status.trace.loading = false;
    }
  }

  /** Цепочка пришла: показываем весь путь сразу, без пояснений до клика. */
  function handleTrace(next: TraceChain): void {
    chain.value = next;
    selected.value = null;

    if (next.outcome === "ok") {
      write(
        "ping",
        "result",
        `цепочка записана: ${next.stages.length} этапов за ${next.elapsed_ms.toFixed(1)} мс`,
      );
    } else {
      write("ping", "error", `прогон не завершился (${next.outcome})`);
    }
  }

  /** Клик по этапу: раскрывает пояснение, повторный клик сворачивает его. */
  function toggle(index: number): void {
    selected.value = selected.value === index ? null : index;
  }

  /** Границы сообщений и настоящее ожидание — по записанным временам. */
  const rows = computed<RouteRow[]>(() => {
    const current = chain.value;
    if (!current) return [];

    const split = current.stages.findIndex((stage) => stage.name === "publish(reply)");
    const result: RouteRow[] = [];

    current.stages.forEach((stage, index) => {
      if (index === 0) {
        result.push({ kind: "divider", title: "сообщение 1 · запрос", at: 0 });
      }
      if (index === split && split > 0) {
        const previous = current.stages[index - 1];
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

  const selectedStage = computed<TraceStage | null>(() => {
    if (!chain.value || selected.value === null) return null;
    return chain.value.stages[selected.value] ?? null;
  });

  return {
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
  };
}

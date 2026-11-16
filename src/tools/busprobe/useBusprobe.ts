// Состояние инструмента Busprobe.
//
// Две операции независимы: обычная самопроверка и учебный прогон с записью
// этапов. Поэтому и состояния два — `status.ping` и `status.trace`, а не один
// общий `loading` (правила Vue). Компонент только показывает то, что здесь
// уже разложено; транспорт целиком в `api.ts`.
//
// Цепочка показывается целиком: настоящий путь длится доли миллисекунды,
// поэтому его разбор идёт не темпом, а пояснениями по клику.

import { computed, reactive, ref } from "vue";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { t } from "@/core/infra/i18n";
import { write } from "@/core/infra/journal";
import { useAsyncAction } from "@/core/infra/useAsyncAction";
import { onPong, onTrace, ping, tracedPing, type Pong, type TraceChain, type TraceStage } from "./api";
import { DEFAULT_ECHO, JOURNAL_SOURCE, TRACE_DELAY_MS } from "./constants";

/** Строка маршрута: этап, граница сообщения или настоящее ожидание. */
export interface RouteRow {
  kind: "stage" | "divider" | "wait";
  /** Порядковый номер строки: ключ для разметки. */
  at: number;
  index?: number;
  stage?: TraceStage;
  title?: string;
  ms?: number;
}

export function useBusprobe() {
  const echo = ref(DEFAULT_ECHO);

  const reply = ref<Pong | null>(null);
  const elapsedMs = ref<number | null>(null);

  const chain = ref<TraceChain | null>(null);
  const selected = ref<number | null>(null);

  let unlistenPong: UnlistenFn | null = null;
  let unlistenTrace: UnlistenFn | null = null;

  /** Обычная самопроверка: запрос и ответ без искусственной задержки. */
  const check = useAsyncAction(async () => {
    write(JOURNAL_SOURCE, "info", `запрос core:ping отправлен, echo=«${echo.value}»`);

    const started = performance.now();
    try {
      const answer = await ping(echo.value);
      reply.value = answer;
      elapsedMs.value = performance.now() - started;
      write(
        JOURNAL_SOURCE,
        "result",
        `ответ получен: echo=«${answer.echo ?? "—"}», correlation=${answer.correlation_id ?? "—"}`,
      );
    } catch (error) {
      write(JOURNAL_SOURCE, "error", `запрос не выполнен: ${String(error)}`);
      throw error;
    }
  });

  /** Учебный прогон: ядро записывает цепочку и присылает её событием. */
  const trace = useAsyncAction(async () => {
    chain.value = null;
    selected.value = null;
    write(JOURNAL_SOURCE, "info", `учебный прогон: core:ping с задержкой ${TRACE_DELAY_MS} мс`);

    try {
      await tracedPing(echo.value, TRACE_DELAY_MS);
    } catch (error) {
      write(JOURNAL_SOURCE, "error", `прогон не выполнен: ${String(error)}`);
      throw error;
    }
  });

  const status = reactive({ ping: check.status, trace: trace.status });

  /**
   * Подписки живут вместе с открытой панелью.
   *
   * Поток `core:pong` показывается в журнале: так видно, что у события
   * несколько независимых наблюдателей, а не только ожидающий `ask`.
   */
  async function start(): Promise<void> {
    try {
      unlistenPong = await onPong((payload) => {
        write(JOURNAL_SOURCE, "info", `второй подписчик получил core:pong: at=${payload.at}`);
      });
      unlistenTrace = await onTrace(handleTrace);
    } catch (error) {
      stop();
      status.trace.error = t("busprobe.view.subscribeFailed", {
        reason: String(error),
      });
      write(JOURNAL_SOURCE, "error", `подписка на события не создана: ${String(error)}`);
    }
  }

  function stop(): void {
    unlistenPong?.();
    unlistenTrace?.();
    unlistenPong = null;
    unlistenTrace = null;
  }

  /** Цепочка пришла: показываем весь путь сразу, без пояснений до клика. */
  function handleTrace(next: TraceChain): void {
    chain.value = next;
    selected.value = null;

    if (next.outcome === "ok") {
      write(
        JOURNAL_SOURCE,
        "result",
        `цепочка записана: ${next.stages.length} этапов за ${next.elapsed_ms.toFixed(1)} мс`,
      );
    } else {
      write(JOURNAL_SOURCE, "error", `прогон не завершился (${next.outcome})`);
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
        result.push({
          kind: "divider",
          title: t("busprobe.route.dividerRequest"),
          at: 0,
        });
      }
      if (index === split && split > 0) {
        const previous = current.stages[index - 1];
        result.push({
          kind: "wait",
          ms: stage.at_ms - previous.at_ms,
          at: index,
        });
        result.push({
          kind: "divider",
          title: t("busprobe.route.dividerReply"),
          at: index,
        });
      }
      result.push({ kind: "stage", stage, index, at: index + 1 });
    });

    return result;
  });

  return {
    echo,
    status,
    reply,
    elapsedMs,
    chain,
    rows,
    selected,
    checkBus: check.run,
    showPath: trace.run,
    toggle,
    start,
    stop,
  };
}

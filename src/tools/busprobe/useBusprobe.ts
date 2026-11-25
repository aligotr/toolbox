// Состояние инструмента Busprobe.
//
// Одна операция: учебный прогон. Она же показывает ответ, а записанную
// цепочку присылает событие `core:trace`. Поэтому состояние одно, а не
// `ping` и `trace` по отдельности (правила Vue). Компонент только показывает
// то, что здесь уже разложено; транспорт целиком в `api.ts`.
//
// Цепочка показывается целиком: настоящий путь длится доли миллисекунды,
// поэтому его разбор идёт не темпом, а пояснениями по клику.

import { computed, ref } from "vue";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { describeError } from "@/core/infra/errors";
import { t } from "@/core/infra/i18n";
import { write } from "@/core/infra/journal";
import { useAsyncAction } from "@/core/infra/useAsyncAction";
import { onPong, onTrace, tracedPing, type Pong, type TraceChain, type TraceStage } from "./api";
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

  /**
   * Учебный прогон: ядро записывает цепочку и присылает её событием.
   *
   * Ответ и путь появляются после одного действия: прошлая цепочка
   * очищается, чтобы отказ не показывал старый путь как новый.
   */
  const probe = useAsyncAction(async () => {
    chain.value = null;
    selected.value = null;
    reply.value = null;
    elapsedMs.value = null;
    write(JOURNAL_SOURCE, "info", "journal.busprobe.traceStarted", {
      delay: TRACE_DELAY_MS,
    });

    const started = performance.now();
    try {
      const answer = await tracedPing(echo.value, TRACE_DELAY_MS);
      reply.value = answer;
      elapsedMs.value = performance.now() - started;
      write(JOURNAL_SOURCE, "result", "journal.busprobe.pong", {
        echo: answer.echo ?? "нет",
        correlation: answer.correlation_id ?? "нет",
      });
    } catch (error) {
      write(JOURNAL_SOURCE, "error", "journal.busprobe.pingError", {
        reason: error,
      });
      throw error;
    }
  });

  const status = probe.status;

  /**
   * Подписки живут вместе с открытой панелью.
   *
   * Поток `core:pong` показывается в журнале: так видно, что у события
   * несколько независимых наблюдателей, а не только ожидающий `ask`.
   */
  async function start(): Promise<void> {
    try {
      unlistenPong = await onPong((payload) => {
        write(JOURNAL_SOURCE, "info", "journal.busprobe.pongObserver", {
          at: payload.at,
        });
      });
      unlistenTrace = await onTrace(handleTrace);
    } catch (error) {
      stop();
      status.error = t("common.subscribeFailed", {
        reason: describeError(error),
      });
      write(JOURNAL_SOURCE, "error", "common.subscribeFailed", {
        reason: error,
      });
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
      write(JOURNAL_SOURCE, "result", "journal.busprobe.traceRecorded", {
        stages: next.stages.length,
        elapsed: next.elapsed_ms,
      });
    } else {
      write(JOURNAL_SOURCE, "error", "journal.busprobe.traceFailed", {
        outcome: next.outcome,
      });
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
    checkBus: probe.run,
    toggle,
    start,
    stop,
  };
}

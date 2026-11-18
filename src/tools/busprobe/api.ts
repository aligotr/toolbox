// Транспорт инструмента Busprobe.
//
// Единственное место, где инструмент трогает мост: компонент и `useBusprobe`
// не знают про `invoke` и `listen`. Топики и формы нагрузки повторяют
// протокол ядра `core:ping`/`core:pong`, поэтому ошибка разбора видна здесь,
// а не в разметке (ADR 0012).

import type { UnlistenFn } from "@tauri-apps/api/event";
import { askTraced, subscribeEvent } from "@/core/infra/bus";
import { TRACE_TIMEOUT_MS } from "./constants";

/** Ответ ядра на учебный запрос. */
export interface Pong {
  echo: string | null;
  /** Момент ответа в миллисекундах эпохи. */
  at: number;
  correlation_id: string | null;
}

/** Этап записанной цепочки `ask`. */
export interface TraceStage {
  name: string;
  topic: string;
  at_ms: number;
  detail: string | null;
}

/** Записанная цепочка запроса и ответа. */
export interface TraceChain {
  topic: string;
  reply_topic: string;
  stages: TraceStage[];
  outcome: "ok" | "timeout" | "error";
  elapsed_ms: number;
}

/**
 * Учебный прогон с записью этапов.
 *
 * Цепочка придёт отдельным событием `core:trace`; функция возвращает ответ,
 * чтобы панель показала его вместе с путём после одного действия.
 */
export async function tracedPing(echo: string, delayMs: number): Promise<Pong> {
  return askTraced<Pong>("core:ping", "core:pong", { echo, delay_ms: delayMs }, TRACE_TIMEOUT_MS);
}

/**
 * Вторая подписка на ответ.
 *
 * Событию может быть несколько независимых наблюдателей; `ask` — один
 * из них. Эта подписка нужна, чтобы показать, что ответ видят все, а не
 * только тот, кто спросил.
 */
export async function onPong(handler: (payload: Pong) => void): Promise<UnlistenFn> {
  return subscribeEvent<Pong>("core:pong", handler);
}

/** Подписка на записанную цепочку: ядро присылает её после прогона. */
export async function onTrace(handler: (chain: TraceChain) => void): Promise<UnlistenFn> {
  return subscribeEvent<TraceChain>("core:trace", handler);
}

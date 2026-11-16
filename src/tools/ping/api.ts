// Транспорт инструмента Ping.
//
// Единственное место, где инструмент трогает мост: компонент и `usePing`
// не знают про `invoke` и `listen`. Топики и формы нагрузки повторяют
// типы Rust-модуля `core.ping`, поэтому ошибка разбора видна здесь,
// а не в разметке (ADR 0012).

import type { UnlistenFn } from "@tauri-apps/api/event";
import { ask, askTraced, subscribeEvent } from "../../core/infra/bus";

/** Ответ ядра на самопроверку. */
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

/** Обычная самопроверка: запрос и ответ без искусственной задержки. */
export async function ping(echo: string): Promise<Pong> {
  return ask<Pong>("core:ping", "core:pong", { echo });
}

/**
 * Учебный прогон с записью этапов.
 *
 * Цепочка придёт отдельным событием `core:trace`; функция только запускает
 * запрос и дожидается ответа.
 */
export async function tracedPing(echo: string, delayMs: number): Promise<void> {
  await askTraced("core:ping", "core:pong", { echo, delay_ms: delayMs }, 5000);
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

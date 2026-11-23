// Транспорт инструмента Ping.
//
// Единственное место, где инструмент трогает мост: компоненты и `useIcmp`
// не знают про `invoke` и `listen` (ADR 0012). Топики и формы нагрузки
// повторяют структуры Rust-модуля `icmp`, поэтому расхождение контракта
// видно здесь, а не в разметке.

import type { UnlistenFn } from "@tauri-apps/api/event";
import { ask, invokeCommand, subscribeEvent } from "@/core/infra/bus";
import type { FinishedEvent, PacketEvent, ResolvedEvent, RunAccepted, RunRequest } from "./types";

/** Запускает проверку и дожидается ответа «принято / отклонено». */
export async function runIcmp(request: RunRequest): Promise<RunAccepted> {
  return ask<RunAccepted>("icmp:run", "icmp:run:accepted", {
    ...request,
  });
}

/** Останавливает проверку; полученные пакеты остаются у интерфейса. */
export async function cancelIcmp(runId: string): Promise<void> {
  await invokeCommand("icmp:cancel", { run_id: runId });
}

/** Подписка на итог разрешения целей. */
export function onIcmpResolved(handler: (event: ResolvedEvent) => void): Promise<UnlistenFn> {
  return subscribeEvent<ResolvedEvent>("icmp:resolved", handler);
}

/** Подписка на отдельные пакеты. */
export function onIcmpPacket(handler: (event: PacketEvent) => void): Promise<UnlistenFn> {
  return subscribeEvent<PacketEvent>("icmp:packet", handler);
}

/** Подписка на завершение проверки. */
export function onIcmpFinished(handler: (event: FinishedEvent) => void): Promise<UnlistenFn> {
  return subscribeEvent<FinishedEvent>("icmp:finished", handler);
}

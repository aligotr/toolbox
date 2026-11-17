// Транспорт инструмента DNS.
//
// Единственное место, где инструмент трогает мост: компоненты и `useDnslookup`
// не знают про `invoke` и `listen` (ADR 0012). Топики и формы нагрузки
// повторяют структуры Rust-модуля `dnslookup`, поэтому расхождение контракта
// видно здесь, а не в разметке.
//
// Список запросов передаётся обычным JSON-массивом: вложенные типы `RunQuery`
// и `RunServer` уже описаны в `types.ts`, дублировать их в сигнатуре незачем.

import type { UnlistenFn } from "@tauri-apps/api/event";
import type { AppError } from "@/contracts/errors";
import { ask, invokeCommand, subscribeEvent } from "@/core/infra/bus";
import type {
  DnsFinishedEvent,
  DnsResultEvent,
  RunAccepted,
  RunRequest,
  SystemServersReply,
} from "./types";

/** Запускает проверку и дожидается ответа «принято / отклонено». */
export async function runDns(request: RunRequest): Promise<RunAccepted> {
  // Копия нужна, чтобы `ask` получил обычный JSON-объект: `RunRequest` —
  // интерфейс, а не словарь с индексной сигнатурой.
  return ask<RunAccepted>("dnslookup:run", "dnslookup:run:accepted", {
    ...request,
  });
}

/** Останавливает проверку; полученные результаты остаются у интерфейса. */
export async function cancelDns(runId: string): Promise<void> {
  await invokeCommand("dnslookup:cancel", { run_id: runId });
}

/** Подписка на результаты отдельных ячеек. */
export function onDnsResult(handler: (event: DnsResultEvent) => void): Promise<UnlistenFn> {
  return subscribeEvent<DnsResultEvent>("dnslookup:result", handler);
}

/** Подписка на завершение проверки. */
export function onDnsFinished(handler: (event: DnsFinishedEvent) => void): Promise<UnlistenFn> {
  return subscribeEvent<DnsFinishedEvent>("dnslookup:finished", handler);
}

/** Запрашивает у ядра адреса системных резолверов. */
export async function loadSystemServers(): Promise<SystemServersReply> {
  return ask<SystemServersReply>("dnslookup:system:servers", "dnslookup:system:servers:reply", {});
}

/** Свой сервер в формате файла профиля. */
export interface StoredServer {
  id: string;
  label: string;
  address: string;
}

/** Ответ на чтение своих серверов. */
export interface ServersLoadReply {
  servers: StoredServer[];
  error: AppError | null;
}

/** Ответ на запись своих серверов. */
export interface ServersSaveReply {
  saved: boolean;
  error: AppError | null;
}

/** Читает свои серверы из профиля. */
export async function loadCustomServers(): Promise<ServersLoadReply> {
  return ask<ServersLoadReply>("dnslookup:servers:load", "dnslookup:servers:load:reply", {});
}

/** Записывает свои серверы в профиль. */
export async function saveCustomServers(servers: StoredServer[]): Promise<ServersSaveReply> {
  return ask<ServersSaveReply>("dnslookup:servers:save", "dnslookup:servers:save:reply", {
    servers: servers.map((server) => ({ ...server })),
  });
}

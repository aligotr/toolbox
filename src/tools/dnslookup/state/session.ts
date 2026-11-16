// Сеансы инструмента DNS.
//
// Карта сеансов живёт в модуле, а не в компоненте: `ToolGrid` размонтирует
// инструмент при переключении вкладок, а строки и результаты должны пережить
// переключение (ADR 0017). Ключ сеанса — `cellKey`, поэтому два экземпляра
// DNS не смешивают данные.
//
// Здесь же уборка брошенных сеансов: перезапущенная или закрытая вкладка
// больше не дождётся ответов, поэтому её проверку незачем досчитывать.

import { reactive } from "vue";
import { write } from "@/core/infra/journal";
import { idle } from "@/core/infra/status";
import { workspace } from "@/core/services/workspace/index";
import { cancelDns } from "../api";
import { DEFAULT_RECORD_TYPE, DEFAULT_SERVER_IDS, JOURNAL_SOURCE } from "../constants";
import { refreshServers } from "./servers";
import type { DnsCell, DnsSession, StatusFilter } from "../types";

/** Сеансы по `cellKey`; переживают переключение вкладок. */
export const sessions = new Map<string, DnsSession>();

/** Ключ результата «строка × сервер»; не путать с `cellKey` места в сетке. */
export function resultKey(rowId: string, serverId: string): string {
  return `${rowId}:${serverId}`;
}

/** Создаёт пустой сеанс с серверами и типом по умолчанию. */
function createSession(): DnsSession {
  return reactive({
    rows: [],
    servers: [...DEFAULT_SERVER_IDS],
    defaultType: DEFAULT_RECORD_TYPE,
    cells: new Map<string, DnsCell>(),
    customServers: [],
    systemAddresses: [],
    // Битый файл своих серверов: чтение вернуло ошибку, запись запрещена,
    // пока файл не исправят или не удалят.
    serversBroken: false,
    runId: null,
    progress: { total: 0, done: 0 },
    status: {
      run: idle(),
      servers: idle(),
      serversSave: idle(),
    },
    filters: { search: "", status: "all" as StatusFilter, diffOnly: false },
    hiddenServers: [],
    highlightRowId: null,
    presetId: null,
    presetTitle: null,
    presetSnapshot: null,
  });
}

/** Убирает сеансы вкладок, которых больше нет в рабочем пространстве. */
export function pruneSessions(): void {
  const openTabs = new Set(workspace.tabs.map((tab) => tab.id));
  if (openTabs.size === 0) return;

  for (const [key, session] of [...sessions]) {
    const parts = key.split(":");
    // Ключ без трёх частей — не место в сетке (например, одиночный запуск).
    if (parts.length < 3 || openTabs.has(parts[0])) continue;

    // Перезапущенная или закрытая вкладка бросает сеанс: его проверке уже
    // некому ответить, поэтому досчитывать запросы впустую не нужно.
    if (session.runId !== null) {
      void cancelDns(session.runId).catch((error: unknown) => {
        write(
          JOURNAL_SOURCE,
          "error",
          `проверка покинутой вкладки не остановлена: ${String(error)}`,
        );
      });
    }

    sessions.delete(key);
  }
}

/** Возвращает сеанс места в сетке, создавая его при первом обращении. */
export function sessionFor(key: string): DnsSession {
  const existing = sessions.get(key);
  if (existing) return existing;

  const session = createSession();
  sessions.set(key, session);
  void refreshServers(session);
  return session;
}

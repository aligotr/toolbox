// Сеансы инструмента Ping.
//
// Карта сеансов живёт в модуле, а не в компоненте: `ToolGrid` размонтирует
// инструмент при переключении вкладок, а цели и пакеты должны пережить
// переключение (ADR 0017). Ключ сеанса - `cellKey`, поэтому два экземпляра
// Ping не смешивают данные.
//
// Здесь же уборка брошенных сеансов: закрытая вкладка больше не дождётся
// пакетов, поэтому её проверку незачем досчитывать.

import { reactive, watch } from "vue";
import { appErrorOf } from "@/core/infra/errors";
import { write } from "@/core/infra/journal";
import { idle } from "@/core/infra/status";
import { workspace } from "@/core/services/workspace/index";
import { cancelIcmp } from "../api";
import {
  DEFAULT_COUNT,
  DEFAULT_FAMILY,
  DEFAULT_PERIOD_MS,
  DEFAULT_TIMEOUT_MS,
  JOURNAL_SOURCE,
} from "../constants";
import type { IcmpSession } from "../types";

/** Сеансы по `cellKey`; переживают переключение вкладок. */
export const sessions = new Map<string, IcmpSession>();

/** Создаёт пустой сеанс с параметрами по умолчанию. */
function createSession(): IcmpSession {
  return reactive({
    targets: [],
    family: DEFAULT_FAMILY,
    periodMs: DEFAULT_PERIOD_MS,
    count: DEFAULT_COUNT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    filters: { search: "", status: "all", family: "all" },
    status: { run: idle() },
    progress: { targets: 0, addresses: 0, sent: 0, received: 0 },
    runId: null,
    highlightTargetId: null,
    presetId: null,
    presetTitle: null,
    presetSnapshot: null,
  });
}

/** Убирает сеансы вкладок, которых больше нет в рабочем пространстве. */
export function pruneSessions(): void {
  const openTabs = new Set(workspace.tabs.map((tab) => tab.id));

  for (const [key, session] of [...sessions]) {
    const parts = key.split(":");
    // Ключ без трёх частей - не место в сетке (например, одиночный запуск).
    if (parts.length < 3 || openTabs.has(parts[0])) continue;

    // Закрытая вкладка бросает сеанс: его проверке уже некому ответить.
    if (session.runId !== null) {
      void cancelIcmp(session.runId).catch((error: unknown) => {
        write(JOURNAL_SOURCE, "error", "journal.icmp.leaveStopError", {
          reason: appErrorOf(error),
        });
      });
    }

    sessions.delete(key);
  }
}

// Закрытие вкладки не монтирует Ping, поэтому уборка идёт от изменения
// рабочего пространства, а не от очередного открытия инструмента.
watch(
  () => workspace.tabs.map((tab) => tab.id),
  () => pruneSessions(),
  { flush: "sync" },
);

/** Возвращает сеанс места в сетке, создавая его при первом обращении. */
export function sessionFor(key: string): IcmpSession {
  const existing = sessions.get(key);
  if (existing) return existing;

  const session = createSession();
  sessions.set(key, session);
  return session;
}

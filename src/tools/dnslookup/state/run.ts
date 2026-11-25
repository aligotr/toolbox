// Запуск проверки DNS и события ядра.
//
// Проверка длиннее одного промиса: ядро присылает результаты по одному
// событию и закрывает прогон отдельным событием. Поэтому `runRows` только
// отправляет запрос, а состояние сеанса меняют подписчики — так результат,
// пришедший пока пользователь смотрел журнал, всё равно попадает в таблицу.
//
// `runId` — единственная связь между событием и сеансом: после отмены или
// загрузки пресета прежние ответы уже не принадлежат таблице и отбрасываются.

import { describeError, appErrorOf } from "@/core/infra/errors";
import { t } from "@/core/infra/i18n";
import { write, type JournalParams } from "@/core/infra/journal";
import { cancelDns, onDnsFinished, onDnsResult, runDns } from "../api";
import { JOURNAL_SOURCE, QUERY_LIMIT } from "../constants";
import { allServers } from "./servers";
import { resultKey, sessions } from "./session";
import type {
  CellSnapshot,
  DnsFinishedEvent,
  DnsResultEvent,
  DnsRow,
  DnsSession,
  RunQuery,
  ServerOption,
} from "../types";

/** Подписки создаются один раз на всё приложение. */
let subscriptions: Promise<void> | null = null;

/** Создаёт подписки на события ядра один раз. */
export function ensureSubscriptions(): void {
  if (subscriptions) return;
  subscriptions = (async () => {
    await onDnsResult(handleResult);
    await onDnsFinished(handleFinished);
    write(JOURNAL_SOURCE, "info", "common.subscribed");
  })().catch((error: unknown) => {
    subscriptions = null;
    const text = t("common.subscribeFailed", {
      reason: describeError(error),
    });
    for (const session of sessions.values()) {
      session.status.run.error = text;
    }
    write(JOURNAL_SOURCE, "error", "common.subscribeFailed", {
      reason: error,
    });
  });
}

/** Раскладывает результат по всем сеансам с тем же `run_id`. */
function handleResult(event: DnsResultEvent): void {
  for (const session of sessions.values()) {
    if (!session.runId || session.runId !== event.run_id) continue;
    session.cells.set(resultKey(event.row_id, event.server_id), {
      status: event.status,
      answers: event.answers,
      elapsedMs: event.elapsed_ms,
      error: event.error ? describeError(event.error) : null,
    });
    session.progress.done = Math.min(session.progress.total, session.progress.done + 1);
  }
}

/** Закрывает проверку: снимает ожидание и сообщает итог в журнал. */
function handleFinished(event: DnsFinishedEvent): void {
  for (const session of sessions.values()) {
    if (!session.runId || session.runId !== event.run_id) continue;

    session.status.run.loading = false;
    session.runId = null;

    for (const [key, cell] of [...session.cells]) {
      if (cell.status === "pending") {
        session.cells.set(key, {
          status: "cancelled",
          answers: [],
          elapsedMs: null,
          error: null,
        });
      }
    }

    const total = session.progress.total;
    if (event.cancelled) {
      write(JOURNAL_SOURCE, "info", "journal.dnslookup.stopped", {
        completed: event.completed,
        total,
      });
    } else {
      write(JOURNAL_SOURCE, "result", "journal.dnslookup.finished", {
        completed: event.completed,
        total,
        elapsed: event.elapsed_ms,
      });
    }
  }
}

/** Запускает проверку выбранных строк на всех выбранных серверах. */
export async function runRows(session: DnsSession, rowIds: string[]): Promise<void> {
  if (session.status.run.loading) return;

  const requested = new Set(rowIds);
  const rows = session.rows.filter((row) => requested.has(row.id));
  if (rows.length === 0) return;

  if (session.servers.length === 0) {
    session.status.run.error = t("dnslookup.run.pickServer");
    return;
  }

  const known = new Map(allServers(session).map((server) => [server.id, server]));
  const servers: ServerOption[] = [];
  for (const id of session.servers) {
    const server = known.get(id);
    if (!server) {
      session.status.run.error = t("dnslookup.run.unknownServer", { id });
      return;
    }
    servers.push(server);
  }

  const total = rows.length * servers.length;
  if (total > QUERY_LIMIT) {
    session.status.run.error = t("dnslookup.run.tooMany", {
      total,
      limit: QUERY_LIMIT,
    });
    write(JOURNAL_SOURCE, "error", "errors.dnslookup.tooManyQueries", {
      count: total,
      limit: QUERY_LIMIT,
    });
    return;
  }

  const runId = crypto.randomUUID();
  session.runId = runId;
  session.status.run.loading = true;
  session.status.run.error = null;
  session.progress = { total, done: 0 };

  const queries: RunQuery[] = [];
  for (const row of rows) {
    for (const server of servers) {
      queries.push({
        query_id: resultKey(row.id, server.id),
        row_id: row.id,
        server_id: server.id,
        name: row.name,
        type: row.type,
      });

      // Старый результат не стирается, а прячется в `previous`: пока идёт
      // проверка, пользователь видит прежние значения приглушённо.
      const key = resultKey(row.id, server.id);
      const current = session.cells.get(key);
      const previous: CellSnapshot | undefined =
        current && current.status !== "pending"
          ? {
              status: current.status,
              answers: current.answers,
              elapsedMs: current.elapsedMs,
              error: current.error,
            }
          : current?.previous;
      session.cells.set(key, {
        status: "pending",
        answers: [],
        elapsedMs: null,
        error: null,
        previous,
      });
    }
  }

  write(JOURNAL_SOURCE, "info", "journal.dnslookup.started", {
    total,
    servers: servers.length,
  });

  try {
    const accepted = await runDns({
      run_id: runId,
      queries,
      servers: servers.map((server) => ({
        id: server.id,
        address: server.address,
      })),
    });

    if (!accepted.accepted) {
      failRun(
        session,
        runId,
        rows,
        servers,
        accepted.error
          ? {
              text: describeError(accepted.error),
              code: "common.runFailed",
              params: { reason: accepted.error },
            }
          : {
              text: t("common.runRejected"),
              code: "common.runRejected",
              params: {},
            },
      );
    }
  } catch (error) {
    failRun(session, runId, rows, servers, {
      text: t("common.runNotStarted", { reason: describeError(error) }),
      code: "common.runNotStarted",
      params: { reason: appErrorOf(error) },
    });
  }
}

/**
 * Отказ проверки: текст для сеанса и факт для журнала.
 *
 * Текст показывает текущий язык, а факт хранит код и данные: после смены
 * языка запись журнала перерисуется, а статус сеанса будет создан заново.
 */
interface RunFailure {
  text: string;
  code: string;
  params: JournalParams;
}

/**
 * Возвращает ячейки к прошлому состоянию, если запуск отклонён.
 *
 * Отказ устаревшей проверки игнорируется: после отмены или загрузки пресета
 * `runId` принадлежит уже другому запуску, и трогать его состояние нельзя.
 */
function failRun(
  session: DnsSession,
  runId: string,
  rows: DnsRow[],
  servers: ServerOption[],
  failure: RunFailure,
): void {
  if (session.runId !== runId) return;

  session.status.run.loading = false;
  session.status.run.error = failure.text;
  session.runId = null;
  session.progress = { total: 0, done: 0 };

  for (const row of rows) {
    for (const server of servers) {
      const key = resultKey(row.id, server.id);
      const cell = session.cells.get(key);
      if (!cell || cell.status !== "pending") continue;
      if (cell.previous) {
        session.cells.set(key, {
          status: cell.previous.status,
          answers: cell.previous.answers,
          elapsedMs: cell.previous.elapsedMs,
          error: cell.previous.error,
        });
      } else {
        session.cells.delete(key);
      }
    }
  }

  write(JOURNAL_SOURCE, "error", failure.code, failure.params);
}

/**
 * Останавливает проверку и сразу отцепляет её от сеанса.
 *
 * `runId` обнуляется до ответа ядра: иначе загрузка пресета ждала бы события
 * завершения, а новый запуск увидел бы занятый сеанс. Ответы отменённой
 * проверки после отцепки игнорируются: они уже не принадлежат таблице.
 */
export async function abortSessionRun(session: DnsSession): Promise<void> {
  if (!session.runId || !session.status.run.loading) return;

  const runId = session.runId;
  const total = session.progress.total;
  const done = session.progress.done;
  session.runId = null;
  session.status.run.loading = false;

  for (const [key, cell] of [...session.cells]) {
    if (cell.status === "pending") {
      session.cells.set(key, {
        status: "cancelled",
        answers: [],
        elapsedMs: null,
        error: null,
      });
    }
  }

  write(JOURNAL_SOURCE, "info", "journal.dnslookup.stopped", {
    completed: done,
    total,
  });

  try {
    await cancelDns(runId);
  } catch (error) {
    session.status.run.error = t("common.runStopFailed", {
      reason: describeError(error),
    });
    write(JOURNAL_SOURCE, "error", "common.runStopFailed", {
      reason: appErrorOf(error),
    });
  }
}

/**
 * Просит ядро остановить проверку и ждёт события завершения.
 *
 * Кнопка «Остановить» оставляет подписи ячеек ядру: событие закроет проверку
 * и запишет итог. Отцепка без ожидания нужна только загрузке пресета
 * и откату изменений, где старые ответы уже не относятся к таблице.
 */
export async function stopRun(session: DnsSession): Promise<void> {
  if (!session.runId || !session.status.run.loading) return;
  try {
    await cancelDns(session.runId);
  } catch (error) {
    session.status.run.error = t("common.runStopFailed", {
      reason: describeError(error),
    });
    write(JOURNAL_SOURCE, "error", "common.runStopFailed", {
      reason: appErrorOf(error),
    });
  }
}

/** Запускает проверку всех строк сеанса. */
export function runAllRows(session: DnsSession): void {
  void runRows(
    session,
    session.rows.map((row) => row.id),
  );
}

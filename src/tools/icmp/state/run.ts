// Запуск проверки Ping.
//
// Проверка длиннее одного промиса: ядро присылает разрешение цели, затем
// пакеты по одному и закрывает прогон отдельным событием. Поэтому запуск
// только отправляет запрос, а состояние сеанса меняют подписчики -
// в `subscriptions.ts`. Так пакет, пришедший пока пользователь смотрел
// журнал, всё равно попадает в таблицу.
//
// `runId` - единственная связь между событием и сеансом: после отмены или
// загрузки пресета прежние пакеты уже не принадлежат таблице и отбрасываются.

import { appErrorOf, describeError } from "@/core/infra/errors";
import { t } from "@/core/infra/i18n";
import { write, type JournalParams } from "@/core/infra/journal";
import type { AppError } from "@/contracts/errors";
import { cancelIcmp, runIcmp } from "../api";
import {
  ENDLESS_COUNT,
  JOURNAL_SOURCE,
  MAX_COUNT,
  MAX_PERIOD_MS,
  MAX_TIMEOUT_MS,
  MIN_COUNT,
  MIN_PERIOD_MS,
  MIN_TIMEOUT_MS,
} from "../constants";
import { addressIncomplete } from "../summary";
import { ensureSubscriptions } from "./subscriptions";
import type { IcmpSession, IcmpTarget, RunTarget } from "../types";

/** Проверяет параметры запуска; текст ошибки читается на текущем языке. */
export function validateRun(session: IcmpSession): string | null {
  if (session.targets.length === 0) return t("icmp.run.noTargets");
  if (
    !Number.isInteger(session.periodMs) ||
    session.periodMs < MIN_PERIOD_MS ||
    session.periodMs > MAX_PERIOD_MS
  ) {
    return t("icmp.run.period", { min: MIN_PERIOD_MS, max: MAX_PERIOD_MS });
  }
  if (
    !session.endless &&
    (!Number.isInteger(session.count) || session.count < MIN_COUNT || session.count > MAX_COUNT)
  ) {
    return t("icmp.run.count", { min: MIN_COUNT, max: MAX_COUNT });
  }
  if (
    !Number.isInteger(session.timeoutMs) ||
    session.timeoutMs < MIN_TIMEOUT_MS ||
    session.timeoutMs > MAX_TIMEOUT_MS
  ) {
    return t("icmp.run.timeout", { min: MIN_TIMEOUT_MS, max: MAX_TIMEOUT_MS });
  }
  return null;
}

/** Запускает проверку всех целей сеанса. */
export function runAll(session: IcmpSession): void {
  void runTargets(
    session,
    session.targets.map((target) => target.id),
  );
}

/** Запускает проверку выбранных целей: остальные результаты не трогаются. */
export async function runTargets(session: IcmpSession, targetIds: string[]): Promise<void> {
  if (session.status.run.loading) return;

  const requested = new Set(targetIds);
  const targets = session.targets.filter((target) => requested.has(target.id));
  if (targets.length === 0) return;

  const problem = validateRun(session);
  if (problem !== null) {
    session.status.run.error = problem;
    return;
  }

  for (const target of targets) {
    target.normalized = null;
    target.addresses = [];
    target.error = null;
    target.active = true;
    target.cancelled = false;
    target.failed = false;
  }

  const runId = crypto.randomUUID();
  session.runId = runId;
  session.status.run.loading = true;
  session.status.run.error = null;
  session.progress = { targets: targets.length, addresses: 0, sent: 0, received: 0 };

  // Подписки обязаны быть готовы до запроса: иначе первые события потеряются,
  // а `loading` останется включённым навсегда.
  if (!(await ensureSubscriptions())) {
    finishRejectedStart(session, runId);
    return;
  }
  if (session.runId !== runId) return;

  try {
    const accepted = await runIcmp({
      run_id: runId,
      targets: targets.map(runTarget),
      period_ms: session.periodMs,
      count: session.endless ? ENDLESS_COUNT : session.count,
      timeout_ms: session.timeoutMs,
    });

    if (!accepted.accepted) {
      rejectAcceptedRun(session, runId, accepted.error);
      return;
    }

    if (session.endless) {
      write(JOURNAL_SOURCE, "info", "journal.icmp.startedEndless", {
        targets: targets.length,
      });
    } else {
      write(JOURNAL_SOURCE, "info", "journal.icmp.started", {
        targets: targets.length,
        count: session.count,
      });
    }
  } catch (error) {
    // Ответ на запуск мог не дойти, а ядро уже приняло запрос: отмена
    // для неизвестного `run_id` безопасна, но не даёт проверке идти впустую.
    void cancelIcmp(runId).catch(() => {});
    failRun(session, runId, {
      text: t("common.runNotStarted", { reason: describeError(error) }),
      code: "journal.icmp.startFailed",
      params: { reason: appErrorOf(error) },
    });
  }
}

/** Цель в форме протокола шины. */
function runTarget(target: IcmpTarget): RunTarget {
  return {
    target_id: target.id,
    input: target.input,
    family: target.family,
  };
}

/** Отказ запуска: текст для сеанса и факт для журнала. */
interface RunFailure {
  text: string;
  code: string;
  params: JournalParams;
}

/** Отказ ядра: причина важнее пустой фразы, готовый перевод в журнал не идёт. */
function rejectAcceptedRun(session: IcmpSession, runId: string, error: AppError | null): void {
  if (error === null) {
    failRun(session, runId, {
      text: t("common.runRejected"),
      code: "journal.icmp.startRejected",
      params: {},
    });
    return;
  }

  failRun(session, runId, {
    text: describeError(error),
    code: "journal.icmp.startFailed",
    params: { reason: error },
  });
}

/** Подписки не готовы: сообщение уже стоит в сеансе, остаётся снять запуск. */
function finishRejectedStart(session: IcmpSession, runId: string): void {
  if (session.runId !== runId) return;
  failActiveTargets(session);
  session.runId = null;
  session.status.run.loading = false;
  session.progress = { targets: 0, addresses: 0, sent: 0, received: 0 };
}

/**
 * Помечает цели неудачного запуска.
 *
 * Без этого строка осталась бы «Ожиданием» после сообщения об отказе:
 * пакетов нет, и отличить отказ от ещё не начатой проверки было бы нельзя.
 */
function failActiveTargets(session: IcmpSession): void {
  for (const target of session.targets) {
    if (!target.active) continue;
    target.active = false;
    target.failed = true;
  }
}

/**
 * Возвращает сеанс к спокойному состоянию, если запуск отклонён.
 *
 * Отказ устаревшей проверки игнорируется: после отмены или загрузки пресета
 * `runId` принадлежит уже другому запуску, и трогать его состояние нельзя.
 */
function failRun(session: IcmpSession, runId: string, failure: RunFailure): void {
  if (session.runId !== runId) return;

  failActiveTargets(session);
  session.status.run.loading = false;
  session.status.run.error = failure.text;
  session.runId = null;
  session.progress = { targets: 0, addresses: 0, sent: 0, received: 0 };

  write(JOURNAL_SOURCE, "error", failure.code, failure.params);
}

/**
 * Останавливает проверку и сразу отцепляет её от сеанса.
 *
 * `runId` обнуляется до ответа ядра: иначе загрузка пресета ждала бы события
 * завершения. Недосчитанные адреса помечаются отменёнными, а полученные
 * пакеты остаются.
 */
export async function abortSessionRun(session: IcmpSession): Promise<void> {
  if (!session.runId || !session.status.run.loading) return;

  const runId = session.runId;
  const progress = { ...session.progress };
  session.runId = null;
  session.status.run.loading = false;

  for (const target of session.targets) {
    if (!target.active) continue;
    target.active = false;

    let incomplete = target.addresses.length === 0;
    for (const address of target.addresses) {
      if (addressIncomplete(address)) {
        address.cancelled = true;
        incomplete = true;
      }
    }
    if (incomplete) target.cancelled = true;
  }

  write(JOURNAL_SOURCE, "info", "journal.icmp.stopped", {
    sent: progress.sent,
    received: progress.received,
  });

  try {
    await cancelIcmp(runId);
  } catch (error) {
    session.status.run.error = t("common.runStopFailed", { reason: describeError(error) });
    write(JOURNAL_SOURCE, "error", "journal.icmp.stopFailed", {
      reason: appErrorOf(error),
    });
  }
}

/**
 * Просит ядро остановить проверку и ждёт события завершения.
 *
 * Кнопка «Остановить» оставляет подписи пакетов ядру: событие закроет
 * проверку и запишет итог. Отцепка без ожидания нужна только загрузке
 * пресета и очистке.
 */
export async function stopRun(session: IcmpSession): Promise<void> {
  if (!session.runId || !session.status.run.loading) return;
  try {
    await cancelIcmp(session.runId);
  } catch (error) {
    session.status.run.error = t("common.runStopFailed", { reason: describeError(error) });
    write(JOURNAL_SOURCE, "error", "journal.icmp.stopFailed", {
      reason: appErrorOf(error),
    });
  }
}

// Подписки Ping и обработчики событий ядра.
//
// События приходят вне жизненного цикла компонента: пакет, полученный пока
// пользователь смотрел журнал, обязан попасть в сеанс. Поэтому подписки
// создаются один раз на приложение, а состояние меняют эти обработчики.
//
// Частичный отказ подписок не оставляет живых обработчиков: уже созданные
// отписки снимаются, иначе следующий запуск добавил бы вторые и пакеты
// считались бы дважды.

import type { UnlistenFn } from "@tauri-apps/api/event";
import { appErrorOf, describeError } from "@/core/infra/errors";
import { t } from "@/core/infra/i18n";
import { write } from "@/core/infra/journal";
import { onIcmpFinished, onIcmpPacket, onIcmpResolved } from "../api";
import { JOURNAL_SOURCE, KEPT_PACKETS } from "../constants";
import { addressIncomplete, emptyTotals, recordPacket } from "../summary";
import { sessions } from "./session";
import type { FinishedEvent, IcmpTarget, PacketEvent, ResolvedEvent } from "../types";

/** Созданные подписки: один промис на приложение. */
let subscriptions: Promise<void> | null = null;

/** Причина отказа подписок: показывается, пока не удалось подписаться снова. */
let subscriptionError: string | null = null;

/**
 * Готовит подписки и сообщает, можно ли запускать проверку.
 *
 * Первый вызов создаёт подписки; повторные ждут тот же промис. Отказ
 * запоминается в сеансах и журнале, а следующий запуск пробует снова.
 */
export async function ensureSubscriptions(): Promise<boolean> {
  if (subscriptions === null) {
    subscriptions = subscribeAll().catch((error: unknown) => {
      subscriptions = null;
      subscriptionError = t("common.subscribeFailed", { reason: describeError(error) });
      for (const session of sessions.values()) {
        session.status.run.error = subscriptionError;
      }
      write(JOURNAL_SOURCE, "error", "common.subscribeFailed", {
        reason: appErrorOf(error),
      });
    });
  }

  await subscriptions;
  if (subscriptions !== null) subscriptionError = null;
  return subscriptionError === null;
}

/** Создаёт три подписки; при отказе снимает уже созданные. */
async function subscribeAll(): Promise<void> {
  const unlisten: UnlistenFn[] = [];

  try {
    unlisten.push(await onIcmpResolved(handleResolved));
    unlisten.push(await onIcmpPacket(handlePacket));
    unlisten.push(await onIcmpFinished(handleFinished));
  } catch (error) {
    for (const stop of unlisten) {
      try {
        stop();
      } catch {
        // Отписка после отказа подписки не обязана успеть: важен сам отказ.
      }
    }
    throw error;
  }

  write(JOURNAL_SOURCE, "info", "common.subscribed");
}

/** Раскладывает разрешение цели по всем сеансам с тем же `run_id`. */
function handleResolved(event: ResolvedEvent): void {
  for (const session of sessions.values()) {
    if (!session.runId || session.runId !== event.run_id) continue;
    const target = session.targets.find((item) => item.id === event.target_id);
    if (!target) continue;

    target.normalized = event.normalized;
    target.error = event.error ? describeError(event.error) : null;
    target.addresses = event.addresses.map((address) => ({
      ip: address.address,
      family: address.family,
      scopeId: address.scope_id,
      expected: session.endless ? null : session.count,
      cancelled: false,
      totals: emptyTotals(),
      packets: [],
    }));
    session.progress.addresses += event.addresses.length;
  }
}

/** Добавляет пакет в адрес цели; чужие события отбрасываются. */
function handlePacket(event: PacketEvent): void {
  for (const session of sessions.values()) {
    if (!session.runId || session.runId !== event.run_id) continue;
    const target = session.targets.find((item) => item.id === event.target_id);
    if (!target) continue;
    const address = target.addresses.find(
      (item) => item.ip === event.address && item.scopeId === event.scope_id,
    );
    if (!address) continue;

    const packet = {
      sequence: event.sequence,
      status: event.status,
      rttMs: event.rtt_ms,
      ttl: event.ttl,
      atMs: event.at_ms,
      error: event.error ? describeError(event.error) : null,
    };
    recordPacket(address, packet, KEPT_PACKETS);
    session.progress.sent += 1;
    if (event.status === "ok") session.progress.received += 1;
  }
}

/** Закрывает проверку: помечает недосчитанное и сообщает итог в журнал. */
function handleFinished(event: FinishedEvent): void {
  for (const session of sessions.values()) {
    if (!session.runId || session.runId !== event.run_id) continue;

    session.status.run.loading = false;
    session.runId = null;

    for (const target of session.targets) {
      finishTarget(target, event);
    }

    session.progress = {
      targets: event.targets,
      addresses: event.addresses,
      sent: event.sent,
      received: event.received,
    };

    if (event.error) {
      session.status.run.error = describeError(event.error);
      write(JOURNAL_SOURCE, "error", "common.runFailed", {
        reason: event.error,
      });
      return;
    }

    if (event.cancelled) {
      write(JOURNAL_SOURCE, "info", "journal.icmp.cancelled", {
        targets: event.targets,
        sent: event.sent,
        received: event.received,
      });
    } else {
      write(JOURNAL_SOURCE, "result", "journal.icmp.finished", {
        targets: event.targets,
        addresses: event.addresses,
        sent: event.sent,
        received: event.received,
        elapsed: event.elapsed_ms,
      });
    }
  }
}

/**
 * Переносит итог прогона на цель.
 *
 * Отмена помечает только недосчитанную цель: если все пакеты успели прийти,
 * статус остаётся результатом серии, а не кнопкой пользователя.
 */
function finishTarget(target: IcmpTarget, event: FinishedEvent): void {
  if (!target.active) return;
  target.active = false;

  if (event.error !== null) {
    target.failed = true;
    return;
  }
  if (!event.cancelled) return;

  let incomplete = target.addresses.length === 0;
  for (const address of target.addresses) {
    if (addressIncomplete(address)) {
      address.cancelled = true;
      incomplete = true;
    }
  }
  if (incomplete) target.cancelled = true;
}

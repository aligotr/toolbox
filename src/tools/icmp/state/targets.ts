// Цели таблицы Ping.
//
// Цель появляется из ввода и удаляется вместе с пакетами. Дубликат
// не создаётся: вместо второй такой же строки подсвечивается первая.
// Новая цель встаёт в начало таблицы: свежий узел виден сразу.
//
// Перестановка уважает фильтр: места меняют только видимые цели, скрытые
// остаются на своих позициях. Запуск по добавлению не происходит: у Ping
// проверку начинает кнопка, поэтому добавление не тратит пакеты.

import { t } from "@/core/infra/i18n";
import { HIGHLIGHT_MS, MAX_TARGETS } from "../constants";
import { matchesFamily, matchesStatus, targetStatus } from "../summary";
import type { AddTargetResult, Family, IcmpSession, IcmpTarget } from "../types";

/** Таймеры подсветки дубликатов: по сеансу, чтобы не плодить висящие. */
const highlightTimers = new WeakMap<IcmpSession, ReturnType<typeof setTimeout>>();

/** Удаляет цель вместе с её пакетами. */
export function removeTarget(session: IcmpSession, targetId: string): void {
  session.targets = session.targets.filter((target) => target.id !== targetId);
  if (session.highlightTargetId === targetId) session.highlightTargetId = null;
}

/**
 * Переставляет цель в видимом списке.
 *
 * Цели, скрытые фильтром, остаются на своих местах: меняются только места
 * видимых, поэтому фильтр не перетасовывает то, чего пользователь не видит.
 */
export function moveTarget(
  session: IcmpSession,
  visible: IcmpTarget[],
  from: number,
  to: number,
): void {
  if (from === to) return;
  const ordered = [...visible];
  const moved = ordered.splice(from, 1)[0];
  if (!moved) return;
  ordered.splice(to, 0, moved);

  const visibleIds = new Set(ordered.map((target) => target.id));
  const slots: number[] = [];
  session.targets.forEach((target, index) => {
    if (visibleIds.has(target.id)) slots.push(index);
  });

  const targets = [...session.targets];
  ordered.forEach((target, index) => {
    targets[slots[index]] = target;
  });
  session.targets = targets;
}

/** Подсвечивает цель-дубликат на короткое время. */
function highlightTarget(session: IcmpSession, targetId: string): void {
  // Сброс нужен, если та же цель подсвечивается повторно: иначе значение
  // не изменится и прокрутка не сработает.
  if (session.highlightTargetId === targetId) session.highlightTargetId = null;
  session.highlightTargetId = targetId;
  const existing = highlightTimers.get(session);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    if (session.highlightTargetId === targetId) session.highlightTargetId = null;
    highlightTimers.delete(session);
  }, HIGHLIGHT_MS);
  highlightTimers.set(session, timer);
}

/** Добавляет цель в начало таблицы; дубликат не создаётся. */
export function addTarget(session: IcmpSession, input: string, family: Family): AddTargetResult {
  const value = input.trim();
  if (value === "") {
    return { kind: "error", message: t("icmp.validate.emptyTarget") };
  }

  if (session.targets.length >= MAX_TARGETS) {
    return {
      kind: "error",
      message: t("icmp.validate.targetLimit", { limit: MAX_TARGETS }),
    };
  }

  const duplicate = session.targets.find(
    (target) => target.family === family && target.input.toLowerCase() === value.toLowerCase(),
  );
  if (duplicate) {
    highlightTarget(session, duplicate.id);
    return { kind: "duplicate", targetId: duplicate.id };
  }

  const target: IcmpTarget = {
    id: crypto.randomUUID(),
    input: value,
    family,
    normalized: null,
    addresses: [],
    error: null,
    active: false,
    cancelled: false,
    failed: false,
  };
  session.targets.unshift(target);
  return { kind: "added", targetId: target.id };
}

/** Цели, которые видит пользователь: поиск, статус и семейство. */
export function filterTargets(session: IcmpSession): IcmpTarget[] {
  const search = session.filters.search.trim().toLowerCase();
  const running = session.status.run.loading;

  return session.targets.filter((target) => {
    if (search !== "") {
      const haystack = `${target.input} ${target.normalized ?? ""}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (!matchesStatus(targetStatus(target, running), session.filters.status)) return false;
    return matchesFamily(target, session.filters.family);
  });
}

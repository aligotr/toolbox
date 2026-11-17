// Строки таблицы DNS.
//
// Строка появляется из ввода, перепроверяется при смене типа и удаляется
// вместе с результатами. Дубликат не создаётся: вместо второй такой же строки
// подсвечивается первая и проверяется заново.
//
// Перестановка уважает фильтр: места меняют только видимые строки, скрытые
// остаются на своих позициях.

import { write } from "@/core/infra/journal";
import { matchesStatus } from "./compare";
import { HIGHLIGHT_MS, JOURNAL_SOURCE } from "../constants";
import { parseAddressInput } from "../normalize";
import { abortSessionRun, runRows } from "./run";
import type { AddRowResult, DnsRow, DnsSession, RecordType, RowVerdict } from "../types";

/** Таймеры подсветки дубликатов: по сеансу, чтобы не плодить висящие. */
const highlightTimers = new WeakMap<DnsSession, ReturnType<typeof setTimeout>>();

/** Очищает строки и результаты; серверы и тип остаются. */
export async function clearSession(session: DnsSession): Promise<void> {
  // Запуск отцепляется от сеанса до очистки: результаты отменённой проверки
  // уже не нужны и не должны вернуть прогресс в чистую таблицу.
  await abortSessionRun(session);

  session.rows = [];
  session.cells.clear();
  session.highlightRowId = null;
  session.status.run.error = null;
  session.filters.search = "";
  session.filters.status = "all";
  session.filters.diffOnly = false;
  session.progress = { total: 0, done: 0 };

  write(JOURNAL_SOURCE, "info", "journal.dnslookup.cleared");
}

/** Сбрасывает результаты одной строки перед сменой типа. */
export function resetRow(session: DnsSession, rowId: string): void {
  for (const key of [...session.cells.keys()]) {
    if (key.startsWith(`${rowId}:`)) session.cells.delete(key);
  }
}

/** Удаляет строку вместе с её результатами. */
export function removeRow(session: DnsSession, rowId: string): void {
  session.rows = session.rows.filter((row) => row.id !== rowId);
  resetRow(session, rowId);
  if (session.highlightRowId === rowId) session.highlightRowId = null;
}

/**
 * Переставляет строку в видимом списке.
 *
 * Строки, скрытые фильтром, остаются на своих местах: меняются только места
 * видимых, поэтому фильтр не перетасовывает то, чего пользователь не видит.
 */
export function moveRow(
  session: DnsSession,
  visible: DnsRow[],
  from: number,
  to: number,
): void {
  if (from === to) return;
  const ordered = [...visible];
  const moved = ordered.splice(from, 1)[0];
  if (!moved) return;
  ordered.splice(to, 0, moved);

  const visibleIds = new Set(ordered.map((row) => row.id));
  const slots: number[] = [];
  session.rows.forEach((row, index) => {
    if (visibleIds.has(row.id)) slots.push(index);
  });

  const rows = [...session.rows];
  ordered.forEach((row, index) => {
    rows[slots[index]] = row;
  });
  session.rows = rows;
}

/** Подсвечивает строку-дубликат на короткое время. */
function highlightRow(session: DnsSession, rowId: string): void {
  // Сброс нужен, если та же строка подсвечивается повторно: иначе значение
  // не изменится и прокрутка не сработает.
  if (session.highlightRowId === rowId) session.highlightRowId = null;
  session.highlightRowId = rowId;
  const existing = highlightTimers.get(session);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    if (session.highlightRowId === rowId) session.highlightRowId = null;
    highlightTimers.delete(session);
  }, HIGHLIGHT_MS);
  highlightTimers.set(session, timer);
}

/** Добавляет строку и сразу проверяет её; дубликат не создаётся. */
export function addRow(session: DnsSession, input: string, type: RecordType): AddRowResult {
  const parsed = parseAddressInput(input, type);
  if (!parsed.ok) {
    return { kind: "error", message: parsed.error };
  }

  const duplicate = session.rows.find(
    (row) =>
      row.type === type && row.name.toLowerCase() === parsed.value.name.toLowerCase(),
  );
  if (duplicate) {
    highlightRow(session, duplicate.id);
    void runRows(session, [duplicate.id]);
    return { kind: "duplicate", rowId: duplicate.id };
  }

  const row: DnsRow = {
    id: crypto.randomUUID(),
    input: parsed.value.display,
    name: parsed.value.name,
    type,
  };
  session.rows.push(row);
  void runRows(session, [row.id]);
  return { kind: "added", rowId: row.id };
}

/** Строки, которые видит пользователь: поиск, статус и расхождения. */
export function filterRows(
  session: DnsSession,
  verdicts: Map<string, RowVerdict>,
): DnsRow[] {
  const search = session.filters.search.trim().toLowerCase();
  return session.rows.filter((row) => {
    if (search !== "") {
      const haystack = `${row.input} ${row.name}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (!matchesStatus(session, row.id, session.filters.status)) return false;
    if (session.filters.diffOnly) {
      return verdicts.get(row.id)?.differs === true;
    }
    return true;
  });
}

// Сравнение ответов DNS.
//
// Сравнение отвечает на один вопрос: совпадает ли ответ выбранного сервера
// с ответом системного. TTL, порядок записей, регистр и завершающая точка
// не важны — они не меняют того, что увидит пользователь.
//
// Вердикт не считается, пока хотя бы одна ячейка не ответила: иначе строка
// на миг «расходилась» бы из-за порядка ответов.

import { EMPTY_STATUSES, ERROR_STATUSES, SYSTEM_SERVER_ID } from "../constants";
import { resultKey } from "./session";
import type { DnsCell, DnsSession, RowVerdict, StatusFilter } from "../types";

/** Сравнивает статус и множество значений; TTL, регистр и точка не важны. */
export function cellsMatch(base: DnsCell, other: DnsCell): boolean {
  if (base.status !== other.status) return false;
  return signature(base) === signature(other);
}

/** Отпечаток набора записей: порядок, регистр и завершающая точка сняты. */
function signature(cell: DnsCell): string {
  return cell.answers
    .map((answer) => answer.value.trim().toLowerCase().replace(/\.$/, ""))
    .sort()
    .join("\n");
}

/** Проверяет, попадает ли строка под фильтр статуса. */
export function matchesStatus(session: DnsSession, rowId: string, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  const pool = filter === "error" ? ERROR_STATUSES : EMPTY_STATUSES;
  return session.servers.some((serverId) => {
    const cell = session.cells.get(resultKey(rowId, serverId));
    return cell !== undefined && pool.includes(cell.status);
  });
}

/** Считает вердикты по всем строкам: без системного сервера их нет. */
export function buildVerdicts(session: DnsSession): Map<string, RowVerdict> {
  const result = new Map<string, RowVerdict>();
  const others = session.servers.filter((id) => id !== SYSTEM_SERVER_ID);
  if (!session.servers.includes(SYSTEM_SERVER_ID) || others.length === 0) {
    return result;
  }

  for (const row of session.rows) {
    const base = session.cells.get(resultKey(row.id, SYSTEM_SERVER_ID));
    if (!base || base.status === "pending" || base.status === "cancelled") {
      continue;
    }

    let matched = 0;
    let ready = true;
    for (const serverId of others) {
      const cell = session.cells.get(resultKey(row.id, serverId));
      if (!cell || cell.status === "pending" || cell.status === "cancelled") {
        ready = false;
        break;
      }
      if (cellsMatch(base, cell)) matched += 1;
    }
    if (!ready) continue;

    result.set(row.id, {
      matched,
      total: others.length,
      differs: matched < others.length,
    });
  }
  return result;
}

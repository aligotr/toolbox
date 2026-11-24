// Показ результата DNS.
//
// Одна ячейка читается в двух местах: в таблице (первая запись и статус)
// и в раскрытии строки (все записи с TTL). Правила чтения одни и те же,
// поэтому живут здесь, а не дублируются в компонентах. Здесь же - подпись
// вердикта строки: её видит шапка раскрытия.
//
// Пока идёт повторная проверка, показываются прошлые записи приглушённо:
// пустая ячейка на время запроса выглядела бы потерей данных.

import { t } from "@/core/infra/i18n";
import type { CellStatus, DnsAnswer, DnsCell, RowVerdict } from "./types";

/** Записи для показа: текущие, а во время проверки — прошлые. */
export function answersOf(cell: DnsCell | undefined): DnsAnswer[] {
  if (!cell) return [];
  return cell.status === "pending" ? (cell.previous?.answers ?? []) : cell.answers;
}

/** Время ответа из текущего или прошлого результата. */
export function elapsedOf(cell: DnsCell | undefined): number | null {
  if (!cell) return null;
  return cell.status === "pending" ? (cell.previous?.elapsedMs ?? null) : cell.elapsedMs;
}

/** Первая запись: остальные показываются в подробностях строки. */
export function firstAnswer(cell: DnsCell | undefined): string {
  return answersOf(cell)[0]?.value ?? "";
}

/** Сколько записей скрыто за первой: пометка «+2» приглашает раскрыть строку. */
export function extraAnswers(cell: DnsCell | undefined): number {
  return Math.max(answersOf(cell).length - 1, 0);
}

/** Подпись статуса для таблицы и раскрытия. */
export function statusText(status: CellStatus): string {
  switch (status) {
    case "ok":
      return t("common.ok");
    case "nodata":
      return t("dnslookup.status.nodata");
    case "nxdomain":
      return t("dnslookup.status.nxdomain");
    case "servfail":
      return t("dnslookup.status.servfail");
    case "refused":
      return t("dnslookup.status.refused");
    case "formerr":
      return t("dnslookup.status.formerr");
    case "notimp":
      return t("dnslookup.status.notimp");
    case "timeout":
      return t("dnslookup.status.timeout");
    case "offline":
      return t("dnslookup.status.offline");
    case "bad_response":
      return t("dnslookup.status.badResponse");
    case "cancelled":
      return t("common.dash");
    default:
      return t("common.dash");
  }
}

/** Подпись статуса; без результата это «ожидание». */
export function statusLabel(cell: DnsCell | undefined): string {
  return statusText(cell?.status ?? "pending");
}

/** Статус — только когда он что-то сообщает: «OK» рядом с адресом лишний,
    ошибка или пустой ответ — наоборот, главное. */
export function statusShown(cell: DnsCell | undefined): boolean {
  if (!cell) return true;
  if (cell.status === "ok" || cell.status === "pending" || cell.status === "cancelled") {
    return answersOf(cell).length === 0;
  }
  return true;
}

/** Оформление статуса: цвет только дополняет подпись, не заменяет её. */
export function statusClass(cell: DnsCell | undefined): string {
  return `cell__status--${cell?.status ?? "pending"}`;
}

/** Пояснение для пустой ячейки: причина важнее прочерка. */
export function noteFor(cell: DnsCell | undefined): string {
  if (!cell) return t("dnslookup.cell.noData");
  if (cell.status === "pending") return t("dnslookup.cell.waiting");
  if (cell.status === "cancelled") return t("dnslookup.cell.cancelled");
  if (cell.error) return cell.error;
  return t("dnslookup.cell.empty");
}

/** Подпись вердикта строки: совпадает с системным или нет.
    Одна подпись на шапку раскрытия
    (счёт серверов не нужен: его видно по строкам). */
export function verdictLabel(verdict: RowVerdict): string {
  return verdict.differs ? t("dnslookup.verdict.differs") : t("common.ok");
}

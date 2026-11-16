// Показ результата ячейки DNS.
//
// Одна ячейка читается в двух местах: в таблице (первая запись и статус)
// и в раскрытии строки (все записи с TTL). Правила чтения одни и те же,
// поэтому живут здесь, а не дублируются в компонентах.
//
// Пока идёт повторная проверка, показываются прошлые записи приглушённо:
// пустая ячейка на время запроса выглядела бы потерей данных.

import { STATUS_LABELS } from "./constants";
import type { DnsAnswer, DnsCell } from "./types";

/** Записи для показа: текущие, а во время проверки — прошлые. */
export function answersOf(cell: DnsCell | undefined): DnsAnswer[] {
  if (!cell) return [];
  return cell.status === "pending" ? (cell.previous?.answers ?? []) : cell.answers;
}

/** Время ответа из текущего или прошлого результата. */
export function elapsedOf(cell: DnsCell | undefined): number | null {
  if (!cell) return null;
  return cell.status === "pending"
    ? (cell.previous?.elapsedMs ?? null)
    : cell.elapsedMs;
}

/** Первая запись: остальные показываются в подробностях строки. */
export function firstAnswer(cell: DnsCell | undefined): string {
  return answersOf(cell)[0]?.value ?? "";
}

/** Сколько записей скрыто за первой: пометка «+2» приглашает раскрыть строку. */
export function extraAnswers(cell: DnsCell | undefined): number {
  return Math.max(answersOf(cell).length - 1, 0);
}

/** Подпись статуса; без результата это «ожидание». */
export function statusLabel(cell: DnsCell | undefined): string {
  return STATUS_LABELS[cell?.status ?? "pending"];
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
  if (!cell) return "нет данных";
  if (cell.status === "pending") return "ожидание ответа";
  if (cell.status === "cancelled") return "проверка остановлена";
  if (cell.error) return cell.error;
  return "записей нет";
}

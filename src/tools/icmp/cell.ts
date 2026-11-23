// Показ результата проверки Ping.
//
// Один статус читается в строке цели, в раскрытии и в CSV. Правила чтения
// одни и те же, поэтому живут здесь, а не дублируются в компонентах.
// Цвет только дополняет подпись: статус всегда виден текстом.

import { t } from "@/core/infra/i18n";
import type { AddressFamily, PacketStatus, SeriesStatus } from "./types";

/** Подпись статуса серии. */
export function statusText(status: SeriesStatus): string {
  switch (status) {
    case "ok":
      return t("icmp.status.ok");
    case "loss":
      return t("icmp.status.loss");
    case "timeout":
      return t("icmp.status.timeout");
    case "unreachable":
      return t("icmp.status.unreachable");
    case "unresolved":
      return t("icmp.status.unresolved");
    case "error":
      return t("icmp.status.error");
    case "cancelled":
      return t("icmp.status.cancelled");
    default:
      return t("icmp.status.pending");
  }
}

/** Подпись статуса одного пакета. */
export function packetStatusText(status: PacketStatus): string {
  switch (status) {
    case "ok":
      return t("icmp.status.ok");
    case "timeout":
      return t("icmp.status.timeout");
    case "unreachable":
      return t("icmp.status.unreachable");
    default:
      return t("icmp.status.error");
  }
}

/** Оформление статуса: цвет статуса, а не строки целиком. */
export function statusClass(status: SeriesStatus): string {
  return `icmp-status icmp-status--${status}`;
}

/** Подпись семейства адреса. */
export function familyText(family: AddressFamily): string {
  return family === "ipv4" ? t("icmp.family.ipv4") : t("icmp.family.ipv6");
}

/** Задержка в миллисекундах: целые без дробной части, дробные - с одной. */
export function formatRtt(value: number | null): string {
  if (value === null) return "-";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Потери в процентах; пока пакетов не было - прочерк. */
export function formatLoss(loss: number | null): string {
  return loss === null ? "-" : `${loss}%`;
}

/** Проценты и задержки для CSV: пустая ячейка вместо прочерка. */
export function csvNumber(value: number | null): string {
  if (value === null) return "";
  return String(Math.round(value * 10) / 10);
}

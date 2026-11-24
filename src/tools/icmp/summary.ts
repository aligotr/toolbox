// Сводка проверки Ping.
//
// Строка цели отвечает на вопросы «отвечает ли узел», «сколько теряется»
// и «как быстро». Считать это в компонентах нельзя: те же правила нужны
// фильтру и раскрытию. Пакеты в памяти только последние, поэтому
// счётчики, потери и задержки ведёт накопленный итог адреса, а не список
// пакетов. Он же помнит отказ и недоступность, даже если такие пакеты уже
// вытеснены из раскрытия.
//
// Статус серии честно разделяет «ждём» и «не ответил»: пока идёт проверка
// без пакетов, это ожидание; после завершения - уже результат.

import type {
  FamilyFilter,
  IcmpAddress,
  IcmpTarget,
  PacketRecord,
  PacketTotals,
  SeriesStatus,
  StatusFilter,
} from "./types";

/** Счётчики и задержки серии пакетов. */
export interface Stats {
  sent: number;
  received: number;
  /** Потери в процентах от отправленных; `null`, пока пакетов не было. */
  loss: number | null;
  min: number | null;
  avg: number | null;
  max: number | null;
  last: number | null;
}

/** Пустой итог: серия ещё не отправила ни одного пакета. */
export function emptyTotals(): PacketTotals {
  return {
    sent: 0,
    received: 0,
    minRttMs: null,
    maxRttMs: null,
    rttSumMs: 0,
    lastRttMs: null,
    lastAtMs: -1,
    lastSequence: -1,
    hasError: false,
    hasUnreachable: false,
  };
}

/** Добавляет пакет в накопленный итог. */
export function addPacket(totals: PacketTotals, packet: PacketRecord): void {
  totals.sent += 1;
  if (packet.status === "error") totals.hasError = true;
  if (packet.status === "unreachable") totals.hasUnreachable = true;

  if (packet.status !== "ok" || packet.rttMs === null) return;

  const rtt = packet.rttMs;
  totals.received += 1;
  totals.rttSumMs += rtt;
  if (totals.minRttMs === null || rtt < totals.minRttMs) totals.minRttMs = rtt;
  if (totals.maxRttMs === null || rtt > totals.maxRttMs) totals.maxRttMs = rtt;

  // «Последний» - по времени отправки, а не по порядку адресов:
  // у параллельных A/AAAA пакеты приходят вперемешку.
  if (
    packet.atMs > totals.lastAtMs ||
    (packet.atMs === totals.lastAtMs && packet.sequence >= totals.lastSequence)
  ) {
    totals.lastRttMs = rtt;
    totals.lastAtMs = packet.atMs;
    totals.lastSequence = packet.sequence;
  }
}

/** Итог по готовому списку пакетов: нужен разбору и проверкам. */
export function totalsOf(packets: PacketRecord[]): PacketTotals {
  const totals = emptyTotals();
  for (const packet of packets) addPacket(totals, packet);
  return totals;
}

/**
 * Записывает пакет в адрес.
 *
 * Итог растёт на каждый пакет, а раскрытие хранит только последние `kept`:
 * бесконечная проверка не должна растить память.
 */
export function recordPacket(address: IcmpAddress, packet: PacketRecord, kept: number): void {
  addPacket(address.totals, packet);
  address.packets.push(packet);
  if (address.packets.length > kept) {
    address.packets.splice(0, address.packets.length - kept);
  }
}

/** Складывает итоги: цель считает по всем своим адресам. */
function mergeTotals(addresses: IcmpAddress[]): PacketTotals {
  const merged = emptyTotals();
  for (const address of addresses) {
    const totals = address.totals;
    merged.sent += totals.sent;
    merged.received += totals.received;
    merged.rttSumMs += totals.rttSumMs;
    merged.hasError ||= totals.hasError;
    merged.hasUnreachable ||= totals.hasUnreachable;

    if (totals.minRttMs !== null) {
      merged.minRttMs =
        merged.minRttMs === null ? totals.minRttMs : Math.min(merged.minRttMs, totals.minRttMs);
    }
    if (totals.maxRttMs !== null) {
      merged.maxRttMs =
        merged.maxRttMs === null ? totals.maxRttMs : Math.max(merged.maxRttMs, totals.maxRttMs);
    }
    if (
      totals.lastAtMs > merged.lastAtMs ||
      (totals.lastAtMs === merged.lastAtMs && totals.lastSequence > merged.lastSequence)
    ) {
      merged.lastRttMs = totals.lastRttMs;
      merged.lastAtMs = totals.lastAtMs;
      merged.lastSequence = totals.lastSequence;
    }
  }
  return merged;
}

/** Счётчики и задержки по накопленному итогу. */
export function statsOfTotals(totals: PacketTotals): Stats {
  const { sent, received } = totals;
  return {
    sent,
    received,
    loss: sent === 0 ? null : Math.round(((sent - received) / sent) * 100),
    min: totals.minRttMs,
    avg: received === 0 ? null : totals.rttSumMs / received,
    max: totals.maxRttMs,
    last: totals.lastRttMs,
  };
}

/** Сводка по пакетам: отправлено, получено, потери и задержки. */
export function statsOf(packets: PacketRecord[]): Stats {
  return statsOfTotals(totalsOf(packets));
}

/** Сводка адреса по всему прогону, а не по последним пакетам. */
export function addressStats(address: IcmpAddress): Stats {
  return statsOfTotals(address.totals);
}

/** Сводка цели по всем её адресам. */
export function targetStats(target: IcmpTarget): Stats {
  return statsOfTotals(mergeTotals(target.addresses));
}

/**
 * Серия не собрала все ожидаемые пакеты.
 *
 * У проверки без ограничения ожидаемого числа нет: остановка всегда
 * обрывает серию, даже если последний пакет успел получить ответ.
 */
export function addressIncomplete(address: IcmpAddress): boolean {
  return address.expected === null || address.totals.sent < address.expected;
}

/**
 * Статус серии пакетов.
 *
 * Отказ вызова важнее отмены: если API не смог отправить пакет, серия
 * оборвалась по причине, а не по кнопке. Недосчитанная серия без отказа -
 * отменённая; завершённая - по числу ответов.
 *
 * Пока серия идёт, ответы без потерь оставляют статус ожидания: «Потери»
 * на середине прогона пугали бы раньше, чем появилась настоящая потеря.
 */
export function seriesStatus(
  totals: PacketTotals,
  expected: number | null,
  cancelled: boolean,
  running: boolean,
): SeriesStatus {
  if (totals.hasError) return "error";
  if (cancelled && (expected === null || totals.sent < expected)) return "cancelled";
  if (totals.sent === 0) return running ? "pending" : "timeout";

  const answered = totals.received;
  if (answered > 0 && answered < totals.sent) return "loss";

  if (answered === 0) {
    // Недоступность важнее таймаута и не зависит от порядка адресов:
    // это факт от сети, а не отсутствие ответа.
    return totals.hasUnreachable ? "unreachable" : "timeout";
  }

  if (expected !== null && totals.sent < expected) return running ? "pending" : "loss";
  return "ok";
}

/** Статус адреса по его пакетам. */
export function addressStatus(address: IcmpAddress, running: boolean): SeriesStatus {
  return seriesStatus(address.totals, address.expected, address.cancelled, running);
}

/** Все пакеты цели: по адресам и последовательностям. */
export function targetPackets(target: IcmpTarget): PacketRecord[] {
  return target.addresses.flatMap((address) => address.packets);
}

/**
 * Статус цели по всем пакетам.
 *
 * Неразрешённое имя важнее пустой серии: у цели нет адресов, и «нет ответа»
 * здесь означало бы совсем другое.
 */
export function targetStatus(target: IcmpTarget, running: boolean): SeriesStatus {
  if (target.error !== null) return "unresolved";
  if (target.failed) return "error";
  if (target.cancelled) return "cancelled";
  if (target.addresses.length === 0) return "pending";

  const endless = target.addresses.some((address) => address.expected === null);
  const expected = endless
    ? null
    : target.addresses.reduce((sum, address) => sum + (address.expected ?? 0), 0);
  const cancelled = target.addresses.some(
    (address) => address.cancelled && addressIncomplete(address),
  );
  return seriesStatus(mergeTotals(target.addresses), expected, cancelled, running);
}

/** Подходит ли цель фильтру статуса. */
export function matchesStatus(status: SeriesStatus, filter: StatusFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "ok":
      return status === "ok";
    case "loss":
      return status === "loss";
    case "failed":
      return (
        status === "timeout" ||
        status === "unreachable" ||
        status === "unresolved" ||
        status === "error" ||
        status === "cancelled"
      );
    default:
      return true;
  }
}

/** Подходит ли цель фильтру семейства: хотя бы один адрес своего семейства. */
export function matchesFamily(target: IcmpTarget, filter: FamilyFilter): boolean {
  if (filter === "all") return true;
  return target.addresses.some((address) => address.family === filter);
}

/** Адрес с scope id: так link-local видно полностью. */
export function addressCaption(address: { ip: string; scopeId: number }): string {
  return address.scopeId > 0 ? `${address.ip}%${address.scopeId}` : address.ip;
}

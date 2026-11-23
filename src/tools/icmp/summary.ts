// Сводка проверки Ping.
//
// Строка цели отвечает на вопросы «отвечает ли узел», «сколько теряется»
// и «как быстро». Считать это в компонентах нельзя: те же правила нужны
// фильтру, CSV и раскрытию. Пакетов может быть много, поэтому функции
// проходят по ним один раз и не зависят от Vue.
//
// Статус серии честно разделяет «ждём» и «не ответил»: пока идёт проверка
// без пакетов, это ожидание; после завершения - уже результат.

import type {
  FamilyFilter,
  IcmpAddress,
  IcmpTarget,
  PacketRecord,
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

/** Сводка по пакетам: отправлено, получено, потери и задержки. */
export function statsOf(packets: PacketRecord[]): Stats {
  let received = 0;
  let total = 0;
  let min: number | null = null;
  let max: number | null = null;
  let last: number | null = null;
  let lastAt = -1;
  let lastSequence = -1;

  for (const packet of packets) {
    if (packet.status !== "ok" || packet.rttMs === null) continue;
    const rtt = packet.rttMs;
    received += 1;
    total += rtt;
    if (min === null || rtt < min) min = rtt;
    if (max === null || rtt > max) max = rtt;
    // «Последний» - по времени отправки, а не по порядку адресов:
    // у параллельных A/AAAA массивы приходят вперемешку.
    if (packet.atMs > lastAt || (packet.atMs === lastAt && packet.sequence >= lastSequence)) {
      last = rtt;
      lastAt = packet.atMs;
      lastSequence = packet.sequence;
    }
  }

  const sent = packets.length;
  return {
    sent,
    received,
    loss: sent === 0 ? null : Math.round(((sent - received) / sent) * 100),
    min,
    avg: received === 0 ? null : total / received,
    max,
    last,
  };
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
  packets: PacketRecord[],
  expected: number,
  cancelled: boolean,
  running: boolean,
): SeriesStatus {
  if (packets.some((packet) => packet.status === "error")) return "error";
  if (cancelled && packets.length < expected) return "cancelled";
  if (packets.length === 0) return running ? "pending" : "timeout";

  const answered = packets.filter((packet) => packet.status === "ok").length;
  if (answered > 0 && answered < packets.length) return "loss";

  if (answered === 0) {
    // Недоступность важнее таймаута и не зависит от порядка адресов:
    // это факт от сети, а не отсутствие ответа.
    return packets.some((packet) => packet.status === "unreachable") ? "unreachable" : "timeout";
  }

  if (packets.length < expected) return running ? "pending" : "loss";
  return "ok";
}

/** Статус адреса по его пакетам. */
export function addressStatus(address: IcmpAddress, running: boolean): SeriesStatus {
  return seriesStatus(address.packets, address.expected, address.cancelled, running);
}

/** Все пакеты цели: по адресам и последовательностям. */
export function targetPackets(target: IcmpTarget): PacketRecord[] {
  return target.addresses.flatMap((address) => address.packets);
}

/** Сводка цели по всем её адресам. */
export function targetStats(target: IcmpTarget): Stats {
  return statsOf(targetPackets(target));
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

  const expected = target.addresses.reduce((sum, address) => sum + address.expected, 0);
  const cancelled = target.addresses.some(
    (address) => address.cancelled && address.packets.length < address.expected,
  );
  return seriesStatus(targetPackets(target), expected, cancelled, running);
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

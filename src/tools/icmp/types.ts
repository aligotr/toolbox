// Типы инструмента Ping.
//
// Здесь два слоя: модель сеанса (цели, адреса, пакеты) и формы протокола
// шины. Они похожи, но не совпадают: сеанс содержит интерфейсный статус
// `pending` и переведённые ошибки, а события ядра - только проводные
// значения и коды словаря. Разделение не даёт интерфейсу «протечь»
// в контракт Rust и наоборот.

import type { AppError } from "@/contracts/errors";

/** Семейство, которое выбирает пользователь для новой цели. */
export type Family = "auto" | "ipv4" | "ipv6";

/** Семейство конкретного адреса проверки. */
export type AddressFamily = "ipv4" | "ipv6";

/** Фильтр по статусу цели. */
export type StatusFilter = "all" | "ok" | "loss" | "failed";

/** Фильтр по семейству адресов. */
export type FamilyFilter = "all" | "ipv4" | "ipv6";

/** Статус пакета: проводные значения ядра. */
export type PacketStatus = "ok" | "timeout" | "unreachable" | "error";

/** Статус серии: проводные значения плюс интерфейсные. */
export type SeriesStatus =
  "pending" | "ok" | "loss" | "timeout" | "unreachable" | "unresolved" | "error" | "cancelled";

/** Один пакет проверки. */
export interface PacketRecord {
  sequence: number;
  status: PacketStatus;
  rttMs: number | null;
  ttl: number | null;
  /** Время отправки, миллисекунды эпохи. */
  atMs: number;
  error: string | null;
}

/** Накопленный итог пакетов адреса: в памяти остаются только последние. */
export interface PacketTotals {
  sent: number;
  received: number;
  minRttMs: number | null;
  maxRttMs: number | null;
  rttSumMs: number;
  lastRttMs: number | null;
  lastAtMs: number;
  lastSequence: number;
  /** Был отказ вызова: он важнее отмены и виден не по последним пакетам. */
  hasError: boolean;
  /** Был статус недоступности: он важнее таймаута. */
  hasUnreachable: boolean;
}

/** Адрес проверки и его пакеты. */
export interface IcmpAddress {
  ip: string;
  family: AddressFamily;
  scopeId: number;
  /** Сколько проверок ожидалось; `null` - проверка без ограничения. */
  expected: number | null;
  /** Серию прервали: недосчитанные пакеты помечаются отменёнными. */
  cancelled: boolean;
  /** Итог всей серии: пакеты хранятся только последние. */
  totals: PacketTotals;
  /** Последние пакеты для раскрытия, не больше `KEPT_PACKETS`. */
  packets: PacketRecord[];
}

/** Цель проверки: то, что ввёл пользователь, и найденные адреса. */
export interface IcmpTarget {
  id: string;
  input: string;
  family: Family;
  /** ASCII-форма имени, если ввод пришлось нормализовать. */
  normalized: string | null;
  addresses: IcmpAddress[];
  /** Причина, по которой адресов нет. */
  error: string | null;
  /** Цель участвует в текущем прогоне: чужие события её не трогают. */
  active: boolean;
  /** Прогон остановлен, не досчитав пакеты этой цели. */
  cancelled: boolean;
  /** Прогон завершился отказом до результата цели. */
  failed: boolean;
}

/** Состояние инструмента одного места в сетке. */
export interface IcmpSession {
  targets: IcmpTarget[];
  /** Семейство новой цели: не фильтр таблицы. */
  family: Family;
  periodMs: number;
  count: number;
  /** Проверка идёт до остановки: количество не ограничивает серию. */
  endless: boolean;
  timeoutMs: number;
  filters: {
    search: string;
    status: StatusFilter;
    family: FamilyFilter;
  };
  status: {
    run: { loading: boolean; error: string | null };
  };
  progress: {
    targets: number;
    addresses: number;
    sent: number;
    received: number;
  };
  runId: string | null;
  highlightTargetId: string | null;
  presetId: string | null;
  presetTitle: string | null;
  presetSnapshot: string | null;
}

/** Результат добавления цели. */
export type AddTargetResult =
  | { kind: "added"; targetId: string }
  | { kind: "duplicate"; targetId: string }
  | { kind: "error"; message: string };

/** Настройки, которые сохраняет пресет. */
export interface IcmpPresetPayload {
  targets: Array<{ id: string; input: string; family: Family }>;
  family: Family;
  periodMs: number;
  count: number;
  endless: boolean;
  timeoutMs: number;
  filters: {
    search: string;
    status: StatusFilter;
    family: FamilyFilter;
  };
}

/** Запуск проверки. */
export interface RunTarget {
  target_id: string;
  input: string;
  family: Family;
}

/** Запрос на проверку. */
export interface RunRequest {
  run_id: string;
  targets: RunTarget[];
  period_ms: number;
  count: number;
  timeout_ms: number;
}

/** Ответ на запуск. */
export interface RunAccepted {
  run_id: string;
  accepted: boolean;
  target_count: number;
  error: AppError | null;
  correlation_id: string | null;
}

/** Адрес в событии разрешения. */
export interface ResolvedAddress {
  address: string;
  family: AddressFamily;
  scope_id: number;
}

/** Итог разрешения имени цели. */
export interface ResolvedEvent {
  run_id: string;
  target_id: string;
  input: string;
  normalized: string | null;
  status: "ok" | "unresolved";
  addresses: ResolvedAddress[];
  error: AppError | null;
}

/** Результат одного пакета. */
export interface PacketEvent {
  run_id: string;
  target_id: string;
  address: string;
  family: AddressFamily;
  scope_id: number;
  sequence: number;
  status: PacketStatus;
  rtt_ms: number | null;
  ttl: number | null;
  at_ms: number;
  error: AppError | null;
}

/** Завершение проверки. */
export interface FinishedEvent {
  run_id: string;
  cancelled: boolean;
  elapsed_ms: number;
  targets: number;
  addresses: number;
  sent: number;
  received: number;
  error: AppError | null;
}

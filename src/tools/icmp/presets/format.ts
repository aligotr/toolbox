// Формат настроек пресета Ping.
//
// Пресет хранит вход инструмента: цели, семейство новой цели, параметры
// и фильтры. Результаты проверок не сохраняются: они принадлежат моменту,
// а не задаче, и загруженный пресет с чужими пакетами выглядел бы
// проверенным.
//
// Разбор снисходителен к прошлому: обязателен только список целей, остальные
// поля могли появиться позже. Неизвестное значение заменяется умолчанием,
// а неполная цель отбрасывается целиком - старый пресет обязан загружаться.

import {
  DEFAULT_COUNT,
  DEFAULT_FAMILY,
  DEFAULT_PERIOD_MS,
  DEFAULT_TIMEOUT_MS,
  isFamily,
  isFamilyFilter,
  isStatusFilter,
  MAX_COUNT,
  MAX_PERIOD_MS,
  MAX_TIMEOUT_MS,
  MIN_COUNT,
  MIN_PERIOD_MS,
  MIN_TIMEOUT_MS,
} from "../constants";
import type { Family, IcmpPresetPayload, IcmpSession } from "../types";

/** Разобранные настройки и число отброшенных неполных целей. */
export interface ParsedPreset {
  payload: IcmpPresetPayload;
  droppedTargets: number;
}

/** Цель пресета: неполная цель отбрасывается целиком. */
function parseTarget(value: unknown): IcmpPresetPayload["targets"][number] | null {
  if (typeof value !== "object" || value === null) return null;
  const target = value as Record<string, unknown>;
  if (typeof target.id !== "string" || target.id === "") return null;
  if (typeof target.input !== "string" || target.input.trim() === "") return null;
  const family: Family = isFamily(target.family) ? target.family : DEFAULT_FAMILY;
  return { id: target.id, input: target.input, family };
}

/** Целое в пределах; всё остальное заменяется умолчанием. */
function bounded(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isInteger(value)) return fallback;
  if (value < min || value > max) return fallback;
  return value;
}

/**
 * Разбирает настройки из файла пресета.
 *
 * Обязателен только `targets`. Неизвестное значение поля заменяется
 * умолчанием, а не роняет весь пресет.
 */
export function parsePresetPayload(payload: unknown): ParsedPreset | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return null;
  }

  const source = payload as Record<string, unknown>;
  if (!Array.isArray(source.targets)) return null;

  const filters =
    typeof source.filters === "object" && source.filters !== null
      ? (source.filters as Record<string, unknown>)
      : {};

  const parsed = source.targets
    .map(parseTarget)
    .filter((target): target is IcmpPresetPayload["targets"][number] => target !== null);

  // Повтор `id` ломает ключ строки: вторая цель затёрла бы первую при
  // удалении, а запуск отклонился бы как дубликат. Оставляем первую.
  const seen = new Set<string>();
  const targets = parsed.filter((target) => {
    if (seen.has(target.id)) return false;
    seen.add(target.id);
    return true;
  });

  return {
    droppedTargets: source.targets.length - targets.length,
    payload: {
      targets,
      family: isFamily(source.family) ? source.family : DEFAULT_FAMILY,
      periodMs: bounded(source.periodMs, MIN_PERIOD_MS, MAX_PERIOD_MS, DEFAULT_PERIOD_MS),
      count: bounded(source.count, MIN_COUNT, MAX_COUNT, DEFAULT_COUNT),
      endless: source.endless === true,
      timeoutMs: bounded(source.timeoutMs, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
      filters: {
        search: typeof filters.search === "string" ? filters.search : "",
        status: isStatusFilter(filters.status) ? filters.status : "all",
        family: isFamilyFilter(filters.family) ? filters.family : "all",
      },
    },
  };
}

/** Собирает снимок настроек сеанса: то, что сохраняет пресет. */
export function capturePresetPayload(session: IcmpSession): IcmpPresetPayload {
  return {
    targets: session.targets.map((target) => ({
      id: target.id,
      input: target.input,
      family: target.family,
    })),
    family: session.family,
    periodMs: session.periodMs,
    count: session.count,
    endless: session.endless,
    timeoutMs: session.timeoutMs,
    filters: {
      search: session.filters.search,
      status: session.filters.status,
      family: session.filters.family,
    },
  };
}

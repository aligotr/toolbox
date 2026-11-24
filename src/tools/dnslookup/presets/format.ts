// Формат настроек пресета DNS.
//
// Пресет хранит вход инструмента: строки, серверы, скрытые колонки и фильтры.
// Формат `payload` принадлежит инструменту (ADR 0028), поэтому разбор и сборка
// живут здесь, а не в сервисе пресетов ядра.
//
// Разбор снисходителен к прошлому: обязательны только строки и серверы,
// остальные поля могли появиться позже. Неизвестное значение заменяется
// умолчанием, а неполная строка отбрасывается целиком — старый пресет обязан
// загружаться.

import { RECORD_TYPES } from "../constants";
import { parseAddressInput } from "../normalize";
import type { DnsPresetPayload, DnsRow, DnsSession, RecordType, StatusFilter } from "../types";

/** Разобранные настройки и число отброшенных неполных строк. */
export interface ParsedPreset {
  payload: DnsPresetPayload;
  droppedRows: number;
}

/** Проверяет, что строка типа записи — известное значение. */
function isRecordType(value: unknown): value is RecordType {
  return typeof value === "string" && (RECORD_TYPES as string[]).includes(value);
}

/** Проверяет, что фильтр статуса — известное значение. */
function isStatusFilter(value: unknown): value is StatusFilter {
  return value === "all" || value === "error" || value === "empty";
}

/** Разбирает строку пресета; неполная или недопустимая строка отбрасывается. */
function parseRow(value: unknown): DnsRow | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || row.id === "") return null;
  if (typeof row.input !== "string" || row.input.trim() === "") return null;
  if (typeof row.name !== "string" || row.name.trim() === "") return null;
  if (!isRecordType(row.type)) return null;

  // Значение пересобирается из ввода: имя из файла могло устареть или
  // не подходить типу. Строка, которая ядру заведомо не годится, отбрасывается,
  // а не остаётся в таблице ради ошибки при запуске.
  const parsed = parseAddressInput(row.input, row.type);
  if (!parsed.ok) return null;
  return { id: row.id, input: parsed.value.display, name: parsed.value.name, type: row.type };
}

/**
 * Разбирает настройки из файла пресета.
 *
 * Обязательны только `rows` и `servers`. Неизвестное значение поля
 * заменяется умолчанием, а не роняет весь пресет.
 */
export function parsePresetPayload(payload: unknown): ParsedPreset | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return null;
  }

  const source = payload as Record<string, unknown>;
  if (!Array.isArray(source.rows) || !Array.isArray(source.servers)) return null;

  const filters =
    typeof source.filters === "object" && source.filters !== null
      ? (source.filters as Record<string, unknown>)
      : {};

  const rows = source.rows.map(parseRow).filter((row): row is DnsRow => row !== null);

  return {
    droppedRows: source.rows.length - rows.length,
    payload: {
      rows,
      servers: source.servers.filter((id): id is string => typeof id === "string" && id !== ""),
      hiddenServers: Array.isArray(source.hiddenServers)
        ? source.hiddenServers.filter((id): id is string => typeof id === "string" && id !== "")
        : [],
      filters: {
        search: typeof filters.search === "string" ? filters.search : "",
        status: isStatusFilter(filters.status) ? filters.status : "all",
        diffOnly: filters.diffOnly === true,
      },
    },
  };
}

/** Собирает снимок настроек сеанса: то, что сохраняет пресет. */
export function capturePresetPayload(session: DnsSession): DnsPresetPayload {
  return {
    rows: session.rows.map((row) => ({
      id: row.id,
      input: row.input,
      name: row.name,
      type: row.type,
    })),
    servers: [...session.servers],
    hiddenServers: [...session.hiddenServers],
    filters: {
      search: session.filters.search,
      status: session.filters.status,
      diffOnly: session.filters.diffOnly,
    },
  };
}

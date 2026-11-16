// Пресеты настроек DNS.
//
// Пресет сохраняет вход инструмента: строки, серверы, скрытые колонки
// и фильтры. Результаты проверок не сохраняются: они принадлежат моменту,
// а не задаче, и загруженный пресет с чужими ответами выглядел бы
// проверенным.
//
// Загрузка сразу запускает проверку всех строк. Работа с файлами — в
// `core/presets.ts`, а здесь только перевод сеанса в снимок и обратно:
// формат `payload` принадлежит инструменту (ADR 0028).

import type { Preset } from "../../contracts/presets";
import { write } from "../../core/journal";
import { createPresets } from "../../core/presets";
import { takeFreshCell } from "../../core/workspace";
import {
  DEFAULT_SERVER_IDS,
  JOURNAL_SOURCE,
  PRESET_TOOL,
  RECORD_TYPES,
  SERVER_LIMIT,
  SYSTEM_SERVER_ID,
} from "./constants";
import type { DnsPresetPayload, DnsRow, DnsSession, RecordType, StatusFilter } from "./types";
import { allServers, abortSessionRun, refreshServers, runAllRows } from "./useDnslookup";

/** Список и операции над пресетами DNS: один на инструмент. */
export const dnsPresets = createPresets(PRESET_TOOL);

/** Итог загрузки пресета: ошибка разбора или замечания о неполной загрузке. */
export interface PresetApplyResult {
  /** Настройки не разобраны: сеанс не тронут. */
  error: string | null;
  /** Что пришлось пропустить: серверы, строки, лишние колонки. */
  warnings: string[];
}

/** Итог отката изменений: причина отказа или признак перезапуска. */
export interface PresetRevertResult {
  /** Откат не выполнен: сеанс не тронут. */
  error: string | null;
  /** Таблица запросов изменилась: результаты очищены и проверка идёт заново. */
  restarted: boolean;
}

/** Разобранные настройки и число отброшенных неполных строк. */
interface ParsedPreset {
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

/** Разбирает строку пресета; неполная строка отбрасывается целиком. */
function parseRow(value: unknown): DnsRow | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || row.id === "") return null;
  if (typeof row.input !== "string" || row.input.trim() === "") return null;
  if (typeof row.name !== "string" || row.name.trim() === "") return null;
  if (!isRecordType(row.type)) return null;
  return { id: row.id, input: row.input, name: row.name, type: row.type };
}

/**
 * Разбирает настройки из файла пресета.
 *
 * Обязательны только `rows` и `servers`: остальные поля могли появиться
 * позже, и старый пресет обязан загружаться. Неизвестное значение поля
 * заменяется умолчанием, а не роняет весь пресет.
 */
function parsePresetPayload(payload: unknown): ParsedPreset | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return null;
  }

  const source = payload as Record<string, unknown>;
  if (!Array.isArray(source.rows) || !Array.isArray(source.servers)) return null;

  const filters =
    typeof source.filters === "object" && source.filters !== null
      ? (source.filters as Record<string, unknown>)
      : {};

  const rows = source.rows
    .map(parseRow)
    .filter((row): row is DnsRow => row !== null);

  return {
    droppedRows: source.rows.length - rows.length,
    payload: {
      rows,
      servers: source.servers.filter(
        (id): id is string => typeof id === "string" && id !== "",
      ),
      hiddenServers: Array.isArray(source.hiddenServers)
        ? source.hiddenServers.filter(
            (id): id is string => typeof id === "string" && id !== "",
          )
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
function capturePresetPayload(session: DnsSession): DnsPresetPayload {
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

/** Строка снимка для сравнения: порядок полей задан сборкой снимка. */
function snapshotOfPayload(payload: DnsPresetPayload): string {
  return JSON.stringify(payload);
}

/** Снимок настроек сеанса в виде строки. */
function snapshotOf(session: DnsSession): string {
  return snapshotOfPayload(capturePresetPayload(session));
}

/**
 * Изменены ли настройки относительно сохранённого пресета.
 *
 * Сеанс без привязки «не изменён»: сравнивать не с чем, и подпись «Изменён»
 * у него была бы ложной.
 */
export function dnsPresetChanged(session: DnsSession): boolean {
  if (session.presetId === null || session.presetSnapshot === null) return false;
  return snapshotOf(session) !== session.presetSnapshot;
}

/** Привязывает сеанс к пресету и запоминает снимок сохранённых настроек. */
function adoptPreset(
  session: DnsSession,
  preset: Preset,
  snapshot: string,
): void {
  session.presetId = preset.id;
  session.presetTitle = preset.title;
  session.presetSnapshot = snapshot;
}

/**
 * Переносит настройки пресета в сеанс.
 *
 * Таблица заменяется, результаты сбрасываются: ответы относились к прежним
 * строкам. `servers` уже проверены и ограничены вызывающим.
 */
function applyPayload(
  session: DnsSession,
  payload: DnsPresetPayload,
  servers: string[],
): void {
  session.rows = payload.rows.map((row) => ({ ...row }));
  session.cells.clear();
  session.servers = servers.length > 0 ? servers : [...DEFAULT_SERVER_IDS];
  session.hiddenServers = payload.hiddenServers.filter((id) =>
    session.servers.includes(id),
  );
  session.filters.search = payload.filters.search;
  session.filters.status = payload.filters.status;
  // Расхождения считаются только от системного сервера: без него фильтр
  // молча не показал бы ничего.
  session.filters.diffOnly =
    payload.filters.diffOnly && session.servers.includes(SYSTEM_SERVER_ID);
  session.highlightRowId = null;
  session.status.run.error = null;
  session.progress = { total: 0, done: 0 };
}

/**
 * Загружает пресет в сеанс и запускает проверку всех строк.
 *
 * Идущая проверка сначала останавливается: её ответы относились бы к строкам,
 * которых в таблице уже нет. Серверы, которых нет в профиле, пропускаются
 * с замечанием; если не осталось ни одного, берётся набор нового сеанса.
 */
export async function applyPreset(
  session: DnsSession,
  preset: Preset,
): Promise<PresetApplyResult> {
  const parsed = parsePresetPayload(preset.payload);
  if (!parsed) {
    return {
      error: `Пресет «${preset.title}» не загружен: настройки не разобраны.`,
      warnings: [],
    };
  }
  const { payload, droppedRows } = parsed;

  await abortSessionRun(session);
  await refreshServers(session);

  const known = new Set(allServers(session).map((server) => server.id));
  const missing = payload.servers.filter((id) => !known.has(id));

  // Непрочитанный файл своих серверов выглядит как «серверы удалены»:
  // загрузка стёрла бы выбор, который ещё можно восстановить.
  if (missing.length > 0 && session.status.servers.error !== null) {
    return {
      error:
        "Пресет не загружен: свои серверы не прочитаны " +
        `(${session.status.servers.error}). Исправьте файл и повторите.`,
      warnings: [],
    };
  }

  const available = payload.servers.filter((id) => known.has(id));
  const servers = available.slice(0, SERVER_LIMIT);

  const warnings: string[] = [];
  if (droppedRows > 0) {
    warnings.push(`пропущено строк: ${droppedRows}`);
  }
  if (missing.length > 0) {
    warnings.push(`не найдены серверы: ${missing.join(", ")}`);
  }
  if (available.length > SERVER_LIMIT) {
    warnings.push(`выбраны первые ${SERVER_LIMIT} серверов`);
  }
  if (payload.servers.length === 0) {
    warnings.push("в пресете не было серверов: взят набор по умолчанию");
  }

  applyPayload(session, payload, servers);

  adoptPreset(session, preset, snapshotOf(session));

  write(
    JOURNAL_SOURCE,
    "result",
    `пресет «${preset.title}» загружен: строк ${session.rows.length}, ` +
      `серверов ${session.servers.length}`,
  );

  if (session.rows.length > 0) runAllRows(session);

  return { error: null, warnings };
}

/**
 * Загружает пресет по умолчанию в новую ячейку инструмента.
 *
 * Признак свежести ячейки гаснет при первом обращении: в уже открытую вкладку
 * пресет не приходит, а перезапуск вкладки даёт новый ключ и снова включает
 * загрузку. Пропавший или неразобранный пресет оставляет вкладку пустой,
 * а причину пишет в журнал — тихо подменять настройки нельзя.
 */
export async function applyDefaultPreset(
  session: DnsSession,
  cellKey: string,
): Promise<void> {
  if (!takeFreshCell(cellKey)) return;

  if (!dnsPresets.state.loaded) await dnsPresets.load();

  const id = dnsPresets.state.defaultId;
  if (id === null) return;

  const preset = dnsPresets.state.items.find((item) => item.id === id);
  if (!preset) {
    write(
      JOURNAL_SOURCE,
      "error",
      `пресет по умолчанию «${id}» не найден: вкладка открыта пустой`,
    );
    return;
  }

  const result = await applyPreset(session, preset);
  if (result.error !== null) {
    write(
      JOURNAL_SOURCE,
      "error",
      `пресет по умолчанию не загружен: ${result.error}`,
    );
    return;
  }
  for (const warning of result.warnings) {
    write(JOURNAL_SOURCE, "info", warning);
  }
}

/**
 * Совпадает ли состав запросов: строки по идентификатору, имени и типу
 * плюс набор серверов.
 *
 * Совпадение позволяет откатить настройки, не теряя результаты: ответы
 * относятся к тем же запросам, поэтому ячейки и проверка остаются на месте.
 */
function sameQueries(
  current: DnsPresetPayload,
  target: DnsPresetPayload,
): boolean {
  if (current.rows.length !== target.rows.length) return false;

  const rowsMatch = current.rows.every((row, index) => {
    const other = target.rows[index];
    return (
      other !== undefined &&
      row.id === other.id &&
      row.name === other.name &&
      row.type === other.type
    );
  });
  if (!rowsMatch) return false;

  if (current.servers.length !== target.servers.length) return false;
  const currentServers = new Set(current.servers);
  return target.servers.every((id) => currentServers.has(id));
}

/**
 * Возвращает настройки пресета, не затрагивая результаты.
 *
 * Применяется, когда запросы не изменились: ячейки остаются, и повторная
 * проверка пользователю не нужна. Порядок серверов восстанавливается
 * вместе с составом — иначе снимок снова разошёлся бы с файлом.
 */
function restoreSettings(session: DnsSession, payload: DnsPresetPayload): void {
  session.rows = payload.rows.map((row) => ({ ...row }));
  session.servers = [...payload.servers];
  session.hiddenServers = payload.hiddenServers.filter((id) =>
    session.servers.includes(id),
  );
  session.filters.search = payload.filters.search;
  session.filters.status = payload.filters.status;
  session.filters.diffOnly =
    payload.filters.diffOnly && session.servers.includes(SYSTEM_SERVER_ID);
  session.highlightRowId = null;
}

/** Разбирает снимок настроек, снятый при загрузке или сохранении пресета. */
function parseSnapshot(snapshot: string): DnsPresetPayload | null {
  try {
    return parsePresetPayload(JSON.parse(snapshot))?.payload ?? null;
  } catch {
    // Снимок собран этим же модулем, но испорченное значение не должно
    // ронять экран: откат просто откажет.
    return null;
  }
}

/**
 * Отменяет правки: возвращает настройки сохранённого пресета.
 *
 * Файл не перечитывается и не меняется — источником служит снимок сеанса.
 * Если запросы не изменились, хватает фильтров и колонок, а результаты
 * остаются. Изменившиеся запросы обесценивают ответы: идущая проверка
 * останавливается, ячейки очищаются и проверка запускается заново.
 */
export async function revertPresetChanges(
  session: DnsSession,
): Promise<PresetRevertResult> {
  if (session.presetId === null || session.presetSnapshot === null) {
    return {
      error: "Нет открытого пресета: отменять нечего.",
      restarted: false,
    };
  }

  const payload = parseSnapshot(session.presetSnapshot);
  if (!payload) {
    return {
      error: "Настройки открытого пресета не разобраны: откат невозможен.",
      restarted: false,
    };
  }

  if (sameQueries(capturePresetPayload(session), payload)) {
    restoreSettings(session, payload);
    write(JOURNAL_SOURCE, "info", "изменения настроек отменены");
    return { error: null, restarted: false };
  }

  await abortSessionRun(session);
  applyPayload(session, payload, payload.servers);

  write(
    JOURNAL_SOURCE,
    "info",
    `изменения отменены: строк ${session.rows.length}, ` +
      `серверов ${session.servers.length}`,
  );

  if (session.rows.length === 0) return { error: null, restarted: false };
  runAllRows(session);
  return { error: null, restarted: true };
}

/** Сохраняет текущие настройки в пресет, к которому привязан сеанс. */
export async function savePresetToCurrent(
  session: DnsSession,
): Promise<Preset | null> {
  if (session.presetId === null) return null;

  // Снимок снимается до записи: правка во время сохранения не должна
  // пометить сеанс совпадающим с файлом, которого она не касалась.
  const payload = capturePresetPayload(session);
  const snapshot = snapshotOfPayload(payload);
  const saved = await dnsPresets.update(session.presetId, payload);
  if (saved) adoptPreset(session, saved, snapshot);
  return saved;
}

/** Создаёт пресет из текущих настроек и привязывает к нему сеанс. */
export async function createPresetFromSession(
  session: DnsSession,
  title: string,
): Promise<Preset | null> {
  const payload = capturePresetPayload(session);
  const snapshot = snapshotOfPayload(payload);
  const created = await dnsPresets.create(title, payload);
  if (created) adoptPreset(session, created, snapshot);
  return created;
}

/** Обновляет название привязки после переименования открытого пресета. */
export function adoptPresetTitle(session: DnsSession, preset: Preset): void {
  if (session.presetId === preset.id) session.presetTitle = preset.title;
}

/**
 * Снимает привязку, если удалён открытый пресет.
 *
 * Снимок при этом теряется: сохранение после удаления создаст новый пресет,
 * а не перезапишет чужой файл.
 */
export function releaseDeletedPreset(
  session: DnsSession,
  presetId: string,
): void {
  if (session.presetId !== presetId) return;
  session.presetId = null;
  session.presetTitle = null;
  session.presetSnapshot = null;
}

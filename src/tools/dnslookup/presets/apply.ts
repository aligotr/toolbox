// Применение настроек пресета к сеансу DNS.
//
// Загрузка заменяет вход инструмента и сбрасывает результаты: ответы
// относились к прежним строкам. Откат возвращает настройки сохранённого
// пресета, не перечитывая файл. Привязка сеанса к пресету живёт здесь же:
// снимок берётся сразу после применения, пока сеанс совпадает с файлом.

import { t } from "@/core/infra/i18n";
import { write } from "@/core/infra/journal";
import type {
  Preset,
  PresetApplyResult,
  PresetProblem,
  PresetRevertResult,
} from "@/core/services/presets";
import {
  DEFAULT_RECORD_TYPE,
  DEFAULT_SERVER_IDS,
  JOURNAL_SOURCE,
  SERVER_LIMIT,
  SYSTEM_SERVER_ID,
} from "../constants";
import { abortSessionRun, runAllRows } from "../state/run";
import { allServers, refreshServers } from "../state/servers";
import type { DnsPresetPayload, DnsSession } from "../types";
import { dnsPresetBinding } from "./binding";
import { parsePresetPayload } from "./format";

/** Итог отката изменений: причина отказа или признак перезапуска. */
export interface DnsPresetRevertResult extends PresetRevertResult {
  /** Таблица запросов изменилась: результаты очищены и проверка идёт заново. */
  restarted: boolean;
}

/**
 * Переносит настройки пресета в сеанс.
 *
 * Таблица заменяется, результаты сбрасываются: ответы относились к прежним
 * строкам. `servers` уже проверены и ограничены вызывающим.
 */
function applyPayload(session: DnsSession, payload: DnsPresetPayload, servers: string[]): void {
  session.rows = payload.rows.map((row) => ({ ...row }));
  session.cells.clear();
  session.servers = servers.length > 0 ? servers : [...DEFAULT_SERVER_IDS];
  session.hiddenServers = payload.hiddenServers.filter((id) => session.servers.includes(id));
  session.filters.search = payload.filters.search;
  session.filters.status = payload.filters.status;
  // Расхождения считаются только от системного сервера: без него фильтр
  // молча не показал бы ничего.
  session.filters.diffOnly = payload.filters.diffOnly && session.servers.includes(SYSTEM_SERVER_ID);
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
export async function applyPreset(session: DnsSession, preset: Preset): Promise<PresetApplyResult> {
  const parsed = parsePresetPayload(preset.payload);
  if (!parsed) {
    return {
      error: {
        code: "presets.loadFailed",
        params: { title: preset.title },
      },
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
      error: {
        code: "dnslookup.preset.serversUnread",
        params: { reason: session.status.servers.error },
      },
      warnings: [],
    };
  }

  const available = payload.servers.filter((id) => known.has(id));
  const servers = available.slice(0, SERVER_LIMIT);

  const warnings: PresetProblem[] = [];
  if (droppedRows > 0) {
    warnings.push({
      code: "dnslookup.preset.warnRows",
      params: { count: droppedRows },
    });
  }
  if (missing.length > 0) {
    warnings.push({
      code: "dnslookup.preset.warnServers",
      params: { list: missing.join(", ") },
    });
  }
  if (available.length > SERVER_LIMIT) {
    warnings.push({
      code: "dnslookup.preset.warnServerLimit",
      params: { count: SERVER_LIMIT },
    });
  }
  if (payload.servers.length === 0) {
    warnings.push({ code: "dnslookup.preset.warnNoServers", params: {} });
  }

  applyPayload(session, payload, servers);

  dnsPresetBinding.adopt(session, preset);

  write(JOURNAL_SOURCE, "result", "journal.dnslookup.presetLoaded", {
    title: preset.title,
    rows: session.rows.length,
    servers: session.servers.length,
  });

  if (session.rows.length > 0) runAllRows(session);

  return { error: null, warnings };
}

/**
 * Начинает новый пресет с чистых настроек.
 *
 * Сеанс отвязывается от открытого пресета, строки и результаты уходят,
 * возвращаются умолчания нового сеанса. Файл прежнего пресета не трогается:
 * его можно загрузить снова. Свои серверы профиля остаются.
 */
export async function startNewPreset(session: DnsSession): Promise<void> {
  await abortSessionRun(session);

  session.rows = [];
  session.cells.clear();
  session.servers = [...DEFAULT_SERVER_IDS];
  session.defaultType = DEFAULT_RECORD_TYPE;
  session.hiddenServers = [];
  session.filters.search = "";
  session.filters.status = "all";
  session.filters.diffOnly = false;
  session.highlightRowId = null;
  session.runId = null;
  session.status.run.error = null;
  session.progress = { total: 0, done: 0 };
  dnsPresetBinding.detach(session);
}

/**
 * Совпадает ли состав запросов: строки по идентификатору, имени и типу
 * плюс набор серверов.
 *
 * Совпадение позволяет откатить настройки, не теряя результаты: ответы
 * относятся к тем же запросам, поэтому ячейки и проверка остаются на месте.
 */
function sameQueries(current: DnsPresetPayload, target: DnsPresetPayload): boolean {
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
  session.hiddenServers = payload.hiddenServers.filter((id) => session.servers.includes(id));
  session.filters.search = payload.filters.search;
  session.filters.status = payload.filters.status;
  session.filters.diffOnly = payload.filters.diffOnly && session.servers.includes(SYSTEM_SERVER_ID);
  session.highlightRowId = null;
}

/**
 * Отменяет правки: возвращает настройки сохранённого пресета.
 *
 * Файл не перечитывается и не меняется — источником служит снимок сеанса.
 * Если запросы не изменились, хватает фильтров и колонок, а результаты
 * остаются. Изменившиеся запросы обесценивают ответы: идущая проверка
 * останавливается, ячейки очищаются и проверка запускается заново.
 */
export async function revertPresetChanges(session: DnsSession): Promise<DnsPresetRevertResult> {
  if (session.presetId === null || session.presetSnapshot === null) {
    return {
      error: t("presets.notReverted"),
      restarted: false,
    };
  }

  const payload = dnsPresetBinding.readSnapshot(session);
  if (!payload) {
    return {
      error: t("presets.snapshotBroken"),
      restarted: false,
    };
  }

  if (sameQueries(dnsPresetBinding.capture(session), payload)) {
    restoreSettings(session, payload);
    write(JOURNAL_SOURCE, "info", "journal.dnslookup.reverted");
    return { error: null, restarted: false };
  }

  await abortSessionRun(session);
  applyPayload(session, payload, payload.servers);

  write(JOURNAL_SOURCE, "info", "journal.dnslookup.revertedRestarted", {
    rows: session.rows.length,
    servers: session.servers.length,
  });

  if (session.rows.length === 0) return { error: null, restarted: false };
  runAllRows(session);
  return { error: null, restarted: true };
}

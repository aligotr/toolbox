// Применение настроек пресета к сеансу Ping.
//
// Загрузка заменяет вход инструмента и сбрасывает результаты: пакеты
// относились к прежним целям и параметрам. Откат возвращает настройки
// сохранённого пресета, не перечитывая файл. Привязка сеанса к пресету
// живёт здесь же: снимок берётся сразу после применения, пока сеанс
// совпадает с файлом.
//
// Запуск после загрузки не начинается: у Ping проверку начинает кнопка,
// и пресет не должен тратить пакеты без ведома пользователя.

import { t } from "@/core/infra/i18n";
import { write } from "@/core/infra/journal";
import type {
  Preset,
  PresetApplyResult,
  PresetProblem,
  PresetRevertResult,
} from "@/core/services/presets";
import {
  DEFAULT_COUNT,
  DEFAULT_FAMILY,
  DEFAULT_PERIOD_MS,
  DEFAULT_TIMEOUT_MS,
  JOURNAL_SOURCE,
  MAX_TARGETS,
} from "../constants";
import { abortSessionRun } from "../state/run";
import type { IcmpPresetPayload, IcmpSession } from "../types";
import { icmpPresetBinding } from "./binding";
import { parsePresetPayload } from "./format";

/** Итог отката изменений: причина отказа или признак очистки результатов. */
export interface IcmpPresetRevertResult extends PresetRevertResult {
  /** Вход изменился: пакеты очищены. */
  cleared: boolean;
}

/** Переносит настройки пресета в сеанс и очищает пакеты. */
function applyPayload(session: IcmpSession, payload: IcmpPresetPayload): void {
  session.targets = payload.targets.slice(0, MAX_TARGETS).map((target) => ({
    id: target.id,
    input: target.input,
    family: target.family,
    normalized: null,
    addresses: [],
    error: null,
    active: false,
    cancelled: false,
    failed: false,
  }));
  session.family = payload.family;
  session.periodMs = payload.periodMs;
  session.count = payload.count;
  session.endless = payload.endless;
  session.timeoutMs = payload.timeoutMs;
  session.filters.search = payload.filters.search;
  session.filters.status = payload.filters.status;
  session.filters.family = payload.filters.family;
  session.highlightTargetId = null;
  session.status.run.error = null;
  session.progress = { targets: 0, addresses: 0, sent: 0, received: 0 };
}

/**
 * Загружает пресет в сеанс.
 *
 * Идущая проверка сначала останавливается: её пакеты относились бы к целям,
 * которых в таблице уже нет. Пропущенные цели и предел списка дают замечания.
 */
export async function applyPreset(
  session: IcmpSession,
  preset: Preset,
): Promise<PresetApplyResult> {
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
  const { payload, droppedTargets } = parsed;

  await abortSessionRun(session);

  const warnings: PresetProblem[] = [];
  if (droppedTargets > 0) {
    warnings.push({
      code: "icmp.preset.warnTargets",
      params: { count: droppedTargets },
    });
  }
  if (payload.targets.length > MAX_TARGETS) {
    warnings.push({
      code: "icmp.preset.warnLimit",
      params: { limit: MAX_TARGETS },
    });
  }

  applyPayload(session, payload);
  icmpPresetBinding.adopt(session, preset);

  write(JOURNAL_SOURCE, "result", "journal.icmp.presetLoaded", {
    title: preset.title,
    targets: session.targets.length,
  });

  return { error: null, warnings };
}

/**
 * Начинает новый пресет с чистых настроек.
 *
 * Сеанс отвязывается от открытого пресета, цели и пакеты уходят,
 * возвращаются умолчания нового сеанса. Файл прежнего пресета не трогается:
 * его можно загрузить снова.
 */
export async function startNewPreset(session: IcmpSession): Promise<void> {
  await abortSessionRun(session);

  session.targets = [];
  session.family = DEFAULT_FAMILY;
  session.periodMs = DEFAULT_PERIOD_MS;
  session.count = DEFAULT_COUNT;
  session.endless = false;
  session.timeoutMs = DEFAULT_TIMEOUT_MS;
  session.filters.search = "";
  session.filters.status = "all";
  session.filters.family = "all";
  session.highlightTargetId = null;
  session.runId = null;
  session.status.run.error = null;
  session.progress = { targets: 0, addresses: 0, sent: 0, received: 0 };
  icmpPresetBinding.detach(session);
}

/** Совпадает ли вход проверки: цели и параметры. Фильтры не считаются. */
function sameInputs(current: IcmpPresetPayload, expected: IcmpPresetPayload): boolean {
  if (
    current.periodMs !== expected.periodMs ||
    current.count !== expected.count ||
    current.endless !== expected.endless ||
    current.timeoutMs !== expected.timeoutMs
  ) {
    return false;
  }
  if (current.targets.length !== expected.targets.length) return false;

  return current.targets.every((target, index) => {
    const other = expected.targets[index];
    return (
      other !== undefined &&
      target.id === other.id &&
      target.input === other.input &&
      target.family === other.family
    );
  });
}

/**
 * Отменяет правки: возвращает настройки сохранённого пресета.
 *
 * Файл не перечитывается и не меняется - источником служит снимок сеанса.
 * Если цели и параметры не изменились, хватает фильтров, а пакеты остаются.
 * Изменившийся вход обесценивает результаты: идущая проверка останавливается
 * и пакеты очищаются.
 */
export async function revertPresetChanges(session: IcmpSession): Promise<IcmpPresetRevertResult> {
  if (session.presetId === null || session.presetSnapshot === null) {
    return { error: t("presets.notReverted"), cleared: false };
  }

  const payload = icmpPresetBinding.readSnapshot(session);
  if (!payload) {
    return { error: t("presets.snapshotBroken"), cleared: false };
  }

  if (sameInputs(icmpPresetBinding.capture(session), payload)) {
    session.family = payload.family;
    session.filters.search = payload.filters.search;
    session.filters.status = payload.filters.status;
    session.filters.family = payload.filters.family;
    session.highlightTargetId = null;
    write(JOURNAL_SOURCE, "info", "journal.icmp.reverted");
    return { error: null, cleared: false };
  }

  await abortSessionRun(session);
  applyPayload(session, payload);

  write(JOURNAL_SOURCE, "info", "journal.icmp.revertedCleared", {
    targets: session.targets.length,
  });

  return { error: null, cleared: true };
}

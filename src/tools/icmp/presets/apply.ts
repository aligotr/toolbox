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
import type { MessageParams } from "@/core/infra/i18n";
import { write } from "@/core/infra/journal";
import type { Preset } from "@/core/services/presets";
import { JOURNAL_SOURCE, MAX_TARGETS } from "../constants";
import { abortSessionRun } from "../state/run";
import type { IcmpPresetPayload, IcmpSession } from "../types";
import { capturePresetPayload, parsePresetPayload, parseSnapshot, snapshotOf } from "./format";

/** Замечание о загрузке пресета: код словаря и данные подстановки. */
export interface PresetProblem {
  code: string;
  params: MessageParams;
}

/** Итог загрузки пресета: ошибка разбора или замечания о неполной загрузке. */
export interface PresetApplyResult {
  /** Настройки не разобраны: сеанс не тронут. */
  error: PresetProblem | null;
  /** Что пришлось пропустить: цели, предел списка. */
  warnings: PresetProblem[];
}

/** Итог отката изменений: причина отказа или признак очистки результатов. */
export interface PresetRevertResult {
  /** Откат не выполнен: сеанс не тронут. */
  error: string | null;
  /** Вход изменился: пакеты очищены. */
  cleared: boolean;
}

/** Привязывает сеанс к пресету и запоминает снимок сохранённых настроек. */
export function adoptPreset(session: IcmpSession, preset: Preset, snapshot: string): void {
  session.presetId = preset.id;
  session.presetTitle = preset.title;
  session.presetSnapshot = snapshot;
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
        code: "icmp.preset.loadFailed",
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
  adoptPreset(session, preset, snapshotOf(session));

  write(JOURNAL_SOURCE, "result", "journal.icmp.presetLoaded", {
    title: preset.title,
    targets: session.targets.length,
  });

  return { error: null, warnings };
}

/** Совпадает ли вход проверки: цели и параметры. Фильтры не считаются. */
function sameInputs(current: IcmpPresetPayload, expected: IcmpPresetPayload): boolean {
  if (
    current.periodMs !== expected.periodMs ||
    current.count !== expected.count ||
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
export async function revertPresetChanges(session: IcmpSession): Promise<PresetRevertResult> {
  if (session.presetId === null || session.presetSnapshot === null) {
    return { error: t("icmp.preset.notReverted"), cleared: false };
  }

  const payload = parseSnapshot(session.presetSnapshot);
  if (!payload) {
    return { error: t("icmp.preset.snapshotBroken"), cleared: false };
  }

  if (sameInputs(capturePresetPayload(session), payload)) {
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

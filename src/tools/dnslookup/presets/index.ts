// Пресеты настроек DNS.
//
// Пресет сохраняет вход инструмента: строки, серверы, скрытые колонки
// и фильтры. Результаты проверок не сохраняются: они принадлежат моменту,
// а не задаче, и загруженный пресет с чужими ответами выглядел бы
// проверенным.
//
// Работа с файлами — в `core/services/presets`, формат `payload` —
// в `format.ts`, применение к сеансу — в `apply.ts`. Здесь привязка сеанса
// к пресету и операции над файлами. Папка `presets/` — граница модуля:
// потребители импортируют `./presets` и не знают о внутреннем делении.

import { write } from "@/core/infra/journal";
import type { Preset } from "@/core/services/presets";
import { createPresets } from "@/core/services/presets/index";
import { takeFreshCell } from "@/core/services/workspace/index";
import { JOURNAL_SOURCE, PRESET_TOOL } from "../constants";
import type { DnsSession } from "../types";
import { adoptPreset, applyPreset } from "./apply";
import { capturePresetPayload, snapshotOf, snapshotOfPayload } from "./format";

export { applyPreset, revertPresetChanges } from "./apply";
export type { PresetApplyResult, PresetRevertResult } from "./apply";

/** Список и операции над пресетами DNS: один на инструмент. */
export const dnsPresets = createPresets(PRESET_TOOL);

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
      "journal.dnslookup.defaultPresetMissing",
      { id },
    );
    return;
  }

  const result = await applyPreset(session, preset);
  if (result.error !== null) {
    write(JOURNAL_SOURCE, "error", result.error.code, result.error.params);
    return;
  }
  for (const warning of result.warnings) {
    write(JOURNAL_SOURCE, "info", warning.code, warning.params);
  }
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

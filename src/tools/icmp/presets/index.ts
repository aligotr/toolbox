// Пресеты настроек Ping.
//
// Пресет сохраняет вход инструмента: цели, семейство новой цели, параметры
// и фильтры. Результаты проверок не сохраняются: они принадлежат моменту,
// а не задаче, и загруженный пресет с чужими пакетами выглядел бы
// проверенным.
//
// Работа с файлами и привязка сеанса - в `core/services/presets`, формат
// `payload` - в `format.ts`, применение к сеансу - в `apply.ts`. Папка
// `presets/` - граница модуля: потребители импортируют `./presets`
// и не знают о внутреннем делении.

import { createDefaultPresetLoader } from "@/core/services/presets/defaultSession";
import {
  DEFAULT_COUNT,
  DEFAULT_FAMILY,
  DEFAULT_PERIOD_MS,
  DEFAULT_TIMEOUT_MS,
  JOURNAL_SOURCE,
} from "../constants";
import type { IcmpSession } from "../types";
import { applyPreset, revertPresetChanges, startNewPreset } from "./apply";
import { icmpPresetBinding, icmpPresets } from "./binding";

export { icmpPresets };
export { applyPreset, revertPresetChanges, startNewPreset };
export type { IcmpPresetRevertResult } from "./apply";

/** Изменены ли настройки относительно сохранённого пресета. */
export const icmpPresetChanged = icmpPresetBinding.changed;

/** Сохраняет текущие настройки в пресет, к которому привязан сеанс. */
export const savePresetToCurrent = icmpPresetBinding.saveCurrent;

/** Создаёт пресет из текущих настроек и привязывает к нему сеанс. */
export const createPresetFromSession = icmpPresetBinding.createFromSession;

/** Обновляет название привязки после переименования открытого пресета. */
export const adoptPresetTitle = icmpPresetBinding.adoptTitle;

/** Снимает привязку, если удалён открытый пресет. */
export const releaseDeletedPreset = icmpPresetBinding.releaseDeleted;

/**
 * Сеанс ещё не тронут: его можно заполнить пресетом по умолчанию.
 *
 * Сравнение с умолчаниями, а не с пустым списком: правка параметра или
 * фильтра тоже ввод пользователя, и терять её нельзя.
 */
function isUntouched(session: IcmpSession): boolean {
  return (
    session.targets.length === 0 &&
    session.runId === null &&
    session.presetId === null &&
    session.family === DEFAULT_FAMILY &&
    session.periodMs === DEFAULT_PERIOD_MS &&
    session.count === DEFAULT_COUNT &&
    !session.endless &&
    session.timeoutMs === DEFAULT_TIMEOUT_MS &&
    session.filters.search === "" &&
    session.filters.status === "all" &&
    session.filters.family === "all"
  );
}

/** Загружает пресет по умолчанию в новую ячейку инструмента. */
export const applyDefaultPreset = createDefaultPresetLoader<IcmpSession>({
  presets: icmpPresets,
  apply: applyPreset,
  journalSource: JOURNAL_SOURCE,
  missingCode: "presets.defaultMissing",
  canApply: isUntouched,
});

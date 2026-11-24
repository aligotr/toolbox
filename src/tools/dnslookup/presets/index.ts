// Пресеты настроек DNS.
//
// Пресет сохраняет вход инструмента: строки, серверы, скрытые колонки
// и фильтры. Результаты проверок не сохраняются: они принадлежат моменту,
// а не задаче, и загруженный пресет с чужими ответами выглядел бы
// проверенным.
//
// Работа с файлами и привязка сеанса - в `core/services/presets`, формат
// `payload` - в `format.ts`, применение к сеансу - в `apply.ts`. Папка
// `presets/` - граница модуля: потребители импортируют `./presets`
// и не знают о внутреннем делении.

import { createDefaultPresetLoader } from "@/core/services/presets/defaultSession";
import { JOURNAL_SOURCE } from "../constants";
import type { DnsSession } from "../types";
import { applyPreset, revertPresetChanges, startNewPreset } from "./apply";
import { dnsPresetBinding, dnsPresets } from "./binding";

export { dnsPresets };
export { applyPreset, revertPresetChanges, startNewPreset };
export type { DnsPresetRevertResult } from "./apply";

/** Изменены ли настройки относительно сохранённого пресета. */
export const dnsPresetChanged = dnsPresetBinding.changed;

/** Сохраняет текущие настройки в пресет, к которому привязан сеанс. */
export const savePresetToCurrent = dnsPresetBinding.saveCurrent;

/** Создаёт пресет из текущих настроек и привязывает к нему сеанс. */
export const createPresetFromSession = dnsPresetBinding.createFromSession;

/** Обновляет название привязки после переименования открытого пресета. */
export const adoptPresetTitle = dnsPresetBinding.adoptTitle;

/** Снимает привязку, если удалён открытый пресет. */
export const releaseDeletedPreset = dnsPresetBinding.releaseDeleted;

/** Загружает пресет по умолчанию в новую ячейку инструмента. */
export const applyDefaultPreset = createDefaultPresetLoader<DnsSession>({
  presets: dnsPresets,
  apply: applyPreset,
  journalSource: JOURNAL_SOURCE,
  missingCode: "journal.dnslookup.defaultPresetMissing",
});

// Подписи пресетов DNS: общая таблица и доменные замены строк.

import { PRESET_BAR_TEXTS, PRESET_DIALOG_TEXTS } from "@/ui/tool/presets/texts";
import type { PresetBarTexts, PresetDialogTexts } from "@/ui/tool/presets/types";

export const DNS_PRESET_BAR_TEXTS: PresetBarTexts = PRESET_BAR_TEXTS;

export const DNS_PRESET_DIALOG_TEXTS: PresetDialogTexts = {
  ...PRESET_DIALOG_TEXTS,
  confirm: {
    ...PRESET_DIALOG_TEXTS.confirm,
    replaceMessage: "dnslookup.preset.replaceMessage",
    replaceRunningMessage: "dnslookup.preset.replaceRunningMessage",
  },
};

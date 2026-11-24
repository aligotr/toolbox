// Подписи пресетов Ping: общая таблица и доменные замены целей.

import { PRESET_BAR_TEXTS, PRESET_DIALOG_TEXTS } from "@/ui/tool/presets/texts";
import type { PresetBarTexts, PresetDialogTexts } from "@/ui/tool/presets/types";

export const ICMP_PRESET_BAR_TEXTS: PresetBarTexts = PRESET_BAR_TEXTS;

export const ICMP_PRESET_DIALOG_TEXTS: PresetDialogTexts = {
  ...PRESET_DIALOG_TEXTS,
  confirm: {
    ...PRESET_DIALOG_TEXTS.confirm,
    replaceMessage: "icmp.preset.replaceMessage",
    replaceRunningMessage: "icmp.preset.replaceRunningMessage",
  },
};

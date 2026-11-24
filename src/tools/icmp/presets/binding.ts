// Связывание сеанса Ping с пресетом.
//
// Список и операции над файлами - общий механизм; здесь сеанс Ping получает
// свой формат снимка. Папка `presets/` - граница модуля: потребители
// импортируют `./presets` и не знают о внутреннем делении.

import { createPresets } from "@/core/services/presets";
import { createSessionPresets } from "@/core/services/presets/session";
import { PRESET_TOOL } from "../constants";
import type { IcmpPresetPayload, IcmpSession } from "../types";
import { capturePresetPayload, parsePresetPayload } from "./format";

/** Список и операции над пресетами Ping: один на инструмент. */
export const icmpPresets = createPresets(PRESET_TOOL);

/** Привязка сеанса Ping к пресету. */
export const icmpPresetBinding = createSessionPresets<IcmpSession, IcmpPresetPayload>({
  presets: icmpPresets,
  capture: capturePresetPayload,
  parse: parsePresetPayload,
});

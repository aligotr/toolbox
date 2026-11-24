// Связывание сеанса DNS с пресетом.
//
// Список и операции над файлами - общий механизм; здесь сеанс DNS получает
// свой формат снимка. Папка `presets/` - граница модуля: потребители
// импортируют `./presets` и не знают о внутреннем делении.

import { createPresets } from "@/core/services/presets";
import { createSessionPresets } from "@/core/services/presets/session";
import { PRESET_TOOL } from "../constants";
import type { DnsPresetPayload, DnsSession } from "../types";
import { capturePresetPayload, parsePresetPayload } from "./format";

/** Список и операции над пресетами DNS: один на инструмент. */
export const dnsPresets = createPresets(PRESET_TOOL);

/** Привязка сеанса DNS к пресету. */
export const dnsPresetBinding = createSessionPresets<DnsSession, DnsPresetPayload>({
  presets: dnsPresets,
  capture: capturePresetPayload,
  parse: parsePresetPayload,
});

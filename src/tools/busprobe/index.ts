// Дескриптор инструмента Busprobe.
//
// `id` — «busprobe», а не «core.ping»: топики `core:ping` и `core:pong` —
// протокол ядра, а не имя инструмента. Собственного Rust-модуля у инструмента
// нет, поэтому правило «id совпадает с модулем» (ADR 0012) не применяется:
// инструмент целиком фронтовый и говорит с ядром через общие топики.

import type { ToolDescriptor } from "@/contracts/tools";
import BusprobeView from "./BusprobeView.vue";

export const busprobeTool: ToolDescriptor<typeof BusprobeView> = {
  id: "busprobe",
  title: "Busprobe",
  descriptionKey: "tools.busprobe.description",
  icon: "pi pi-bolt",
  order: 10,
  component: BusprobeView,
};

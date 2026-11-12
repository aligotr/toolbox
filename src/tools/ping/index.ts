// Дескриптор инструмента Ping.
//
// `id` — «ping», а не «core.ping»: Rust-модуль `core.ping` — служебная
// самопроверка ядра, а не отдельная подсистема инструмента. Здесь нет
// собственного Rust-модуля, поэтому правило «id совпадает с модулем»
// (ADR 0012) не применяется: инструмент целиком фронтовый и говорит
// с ядром через общие топики.

import type { ToolDescriptor } from "../../contracts/tools";
import PingView from "./PingView.vue";

export const pingTool: ToolDescriptor = {
  id: "ping",
  title: "Ping",
  description: "Самопроверка шины и путь сообщения",
  icon: "pi pi-bolt",
  order: 10,
  component: PingView,
};

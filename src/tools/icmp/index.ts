// Дескриптор инструмента Ping.
//
// `id` совпадает с идентификатором Rust-модуля `icmp` (ADR 0012):
// так топики шины, папка интерфейса и подсистема называются одинаково.
// Имя `ping` занято служебным протоколом `core:ping`, поэтому инструмент
// называется `icmp`, а на экране - Ping (ADR 0068).

import type { ToolDescriptor } from "@/contracts/tools";
import IcmpView from "./IcmpView.vue";
import { TOOL_TITLE } from "./constants";

export const icmpTool: ToolDescriptor<typeof IcmpView> = {
  id: "icmp",
  title: TOOL_TITLE,
  descriptionKey: "tools.icmp.description",
  icon: "pi pi-wifi",
  order: 20,
  // Разные вкладки - разные списки целей и параметры, это осознанный
  // сценарий. Обычный выбор ведёт в последнюю активную вкладку, а жест
  // «ещё одна вкладка» открывает рядом новую (ADR 0042).
  multipleTabs: true,
  component: IcmpView,
};

// Дескриптор инструмента DNS.
//
// `id` совпадает с идентификатором Rust-модуля `dnslookup` (ADR 0012):
// так топики шины, папка интерфейса и подсистема называются одинаково.

import type { ToolDescriptor } from "@/contracts/tools";
import DnslookupView from "./DnslookupView.vue";
import { TOOL_TITLE } from "./constants";

export const dnslookupTool: ToolDescriptor<typeof DnslookupView> = {
  id: "dnslookup",
  title: TOOL_TITLE,
  descriptionKey: "tools.dnslookup.description",
  icon: "pi pi-globe",
  order: 20,
  // Разные вкладки — разные наборы доменов и серверов, это осознанный
  // сценарий. Обычный выбор ведёт в последнюю активную вкладку, а жест
  // «ещё одна вкладка» открывает рядом новую (ADR 0042).
  multipleTabs: true,
  component: DnslookupView,
};

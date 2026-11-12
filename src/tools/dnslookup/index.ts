// Дескриптор инструмента DNS.
//
// `id` совпадает с идентификатором Rust-модуля `dnslookup` (ADR 0012):
// так топики шины, папка интерфейса и подсистема называются одинаково.

import type { ToolDescriptor } from "../../contracts/tools";
import DnslookupView from "./DnslookupView.vue";

export const dnslookupTool: ToolDescriptor = {
  id: "dnslookup",
  title: "DNS",
  description: "Проверка и сравнение ответов DNS-серверов",
  icon: "pi pi-globe",
  order: 20,
  component: DnslookupView,
};

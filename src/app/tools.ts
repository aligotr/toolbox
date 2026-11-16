// Реестр инструментов интерфейса.
//
// Точка сборки — единственное место, где оболочка встречается с инструментами:
// здесь они перечислены, отсортированы и переданы в `WorkbenchView`.
// Новый инструмент подключается одной записью; сайдбар и вкладки не меняются
// (ADR 0012).

import type { Component } from "vue";
import type { ToolDescriptor } from "@/contracts/tools";
import { busprobeTool } from "@/tools/busprobe";
import { dnslookupTool } from "@/tools/dnslookup";

/** Инструменты в порядке поля `order`. */
function sortedTools(tools: ToolDescriptor<Component>[]): ToolDescriptor<Component>[] {
  return [...tools].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export const tools: ToolDescriptor<Component>[] = sortedTools([busprobeTool, dnslookupTool]);

// Реестр инструментов интерфейса.
//
// Точка сборки — единственное место, где оболочка встречается с инструментами:
// здесь они перечислены, отсортированы и переданы в `AppShell`.
// Новый инструмент подключается одной записью; сайдбар и вкладки не меняются
// (ADR 0012).

import type { ToolDescriptor } from "../contracts/tools";
import { dnslookupTool } from "../tools/dnslookup";
import { pingTool } from "../tools/ping";

/** Инструменты в порядке поля `order`. */
function sortedTools(tools: ToolDescriptor[]): ToolDescriptor[] {
  return [...tools].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export const tools: ToolDescriptor[] = sortedTools([pingTool, dnslookupTool]);

// Реестр инструментов интерфейса.
//
// Точка сборки — единственное место, где оболочка встречается с инструментами:
// здесь они перечислены, отсортированы и переданы в `AppShell`.
// Новый инструмент подключается одной записью; сайдбар и вкладки не меняются
// (ADR 0012).

import { sortedTools, type ToolDescriptor } from "../contracts/tools";
import { dnslookupTool } from "../tools/dnslookup";
import { pingTool } from "../tools/ping";

export const tools: ToolDescriptor[] = sortedTools([pingTool, dnslookupTool]);

// Жесты выбора инструмента: обычный выбор и «ещё одна вкладка».
//
// Мест два — сайдбар и карточка на пустой вкладке, — а правило одно:
// Ctrl+клик, средняя кнопка мыши и Ctrl+Enter просят ещё одну вкладку,
// обычный клик выбирает инструмент (ADR 0042). Разбор событий живёт здесь,
// чтобы разметка не повторяла одно условие дважды.

import type { ToolDescriptor } from "@/contracts/tools";
import { openTool } from "@/core/services/workspace/index";

/** Номер средней кнопки мыши в `MouseEvent.button`. */
const MIDDLE_BUTTON = 1;

/** Клик: Ctrl в момент клика просит ещё одну вкладку. */
export function openToolOnClick(tool: ToolDescriptor, event: MouseEvent): void {
  openTool(tool, event.ctrlKey);
}

/** Средняя кнопка мыши: ещё одна вкладка вместо прокрутки. */
export function openToolOnAuxClick(tool: ToolDescriptor, event: MouseEvent): void {
  if (event.button !== MIDDLE_BUTTON) return;
  event.preventDefault();
  openTool(tool, true);
}

/** Ctrl+Enter с клавиатуры: тот же жест, что Ctrl+клик. */
export function openToolOnKeydown(tool: ToolDescriptor, event: KeyboardEvent): void {
  // Автоповтор удержания открыл бы вкладку за вкладкой.
  if (event.repeat || event.key !== "Enter" || !event.ctrlKey) return;
  // Иначе кнопка отправила бы ещё и click — открылись бы две вкладки.
  event.preventDefault();
  openTool(tool, true);
}

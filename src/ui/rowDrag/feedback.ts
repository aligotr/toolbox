// Подсветка переноса строк: активная таблица, приглушённая строка, линия.
//
// Классы не собираются в разметке: помощник сам ставит и снимает их, поэтому
// таблица не дублирует имена и не зависит от внутреннего устройства переноса.

import {
  ACTIVE_CLASS,
  LINE_BOTTOM_CLASS,
  LINE_TOP_CLASS,
  SOURCE_CLASS,
} from "./constants";
import { dataRows } from "./geometry";

/** Начало переноса: курсор, запрет выделения и приглушённая строка. */
export function markSource(container: HTMLElement, source: HTMLElement): void {
  container.classList.add(ACTIVE_CLASS);
  source.classList.add(SOURCE_CLASS);
  document.body.style.cursor = "grabbing";
}

/** Снятие подсветки: контейнер и строка возвращаются в обычный вид. */
export function clearSource(
  container: HTMLElement | null,
  source: HTMLElement | null,
): void {
  container?.classList.remove(ACTIVE_CLASS);
  source?.classList.remove(SOURCE_CLASS);
  document.body.style.cursor = "";
}

/**
 * Линия вставки: класс ставится строкам всех тел, чтобы подсветка была целой.
 *
 * `null` — линии нет; `count` приходит от таблицы, потому что конец списка
 * подсвечивается снизу последней строки.
 */
export function showLine(
  container: HTMLElement | null,
  boundary: number | null,
  count: number,
): void {
  if (!container) return;

  for (const node of container.querySelectorAll(
    `.${LINE_TOP_CLASS}, .${LINE_BOTTOM_CLASS}`,
  )) {
    node.classList.remove(LINE_TOP_CLASS, LINE_BOTTOM_CLASS);
  }
  if (boundary === null) return;

  const bottom = boundary >= count;
  const markerIndex = bottom ? count - 1 : boundary;
  if (markerIndex < 0) return;

  const marker = bottom ? LINE_BOTTOM_CLASS : LINE_TOP_CLASS;
  for (const body of container.querySelectorAll("tbody")) {
    dataRows(body)[markerIndex]?.classList.add(marker);
  }
}

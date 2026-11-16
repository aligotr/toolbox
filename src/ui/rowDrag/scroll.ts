// Самопрокрутка таблицы при переносе строки.
//
// Без неё строку из длинной таблицы не перенести: указатель у края ничего
// не прокручивает, и место вставки остаётся за пределами экрана.

import { AUTO_SCROLL_EDGE_PX, AUTO_SCROLL_STEP_PX } from "./constants";

/** Ближайшая прокручиваемая область: по её краям идёт самопрокрутка. */
export function scrollParentOf(element: HTMLElement): HTMLElement | null {
  for (
    let node = element.parentElement;
    node && node !== document.body;
    node = node.parentElement
  ) {
    const overflow = getComputedStyle(node).overflowY;
    if (
      (overflow === "auto" || overflow === "scroll") &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
  }
  return null;
}

/** Прокрутка у края: иначе длинную таблицу не перенести. */
export function autoScroll(scroller: HTMLElement | null, clientY: number): void {
  if (!scroller) return;
  const box = scroller.getBoundingClientRect();
  if (clientY < box.top + AUTO_SCROLL_EDGE_PX) {
    scroller.scrollTop -= AUTO_SCROLL_STEP_PX;
  } else if (clientY > box.bottom - AUTO_SCROLL_EDGE_PX) {
    scroller.scrollTop += AUTO_SCROLL_STEP_PX;
  }
}

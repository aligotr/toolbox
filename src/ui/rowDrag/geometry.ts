// Геометрия таблицы для переноса строк.
//
// Помощник не знает про данные инструмента: он находит строки в готовом DOM,
// считает их индексы и переводит положение указателя в границу вставки.
// Здесь нет состояния — только чтение разметки.

import { EXPANSION_ROW_CLASS } from "./constants";

/** Строки данных тела таблицы: строки раскрытия пропускаются. */
export function dataRows(body: Element): HTMLElement[] {
  return [...body.children].filter(
    (node): node is HTMLElement =>
      node instanceof HTMLElement &&
      node.tagName === "TR" &&
      !node.classList.contains(EXPANSION_ROW_CLASS),
  );
}

/** Первое тело таблицы: по нему считаются границы вне строк. */
export function firstRows(container: HTMLElement | null): HTMLElement[] {
  const body = container?.querySelector("tbody");
  return body ? dataRows(body) : [];
}

/** Индекс строки внутри своего тела: у всех тел он совпадает. */
export function rowIndex(row: HTMLElement): number | null {
  const body = row.parentElement;
  if (!body) return null;
  const index = dataRows(body).indexOf(row);
  return index >= 0 ? index : null;
}

/** Строка под указателем: события приходят и от ячеек, и от вложенных узлов. */
export function rowOf(
  container: HTMLElement | null,
  target: EventTarget | null,
): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const row = target.closest<HTMLElement>("tr");
  return row && container?.contains(row) ? row : null;
}

/** Есть ли под указателем текст: его мышью выделяют, а не тянут. */
export function hasText(target: Element, row: HTMLElement): boolean {
  for (
    let node: Element | null = target;
    node && node !== row;
    node = node.parentElement
  ) {
    for (const child of node.childNodes) {
      if (
        child.nodeType === Node.TEXT_NODE &&
        (child.textContent ?? "").trim() !== ""
      ) {
        return true;
      }
    }
  }
  return false;
}

/** Граница вставки по положению указателя: верхняя половина — до строки. */
export function boundaryAt(row: HTMLElement, clientY: number): number | null {
  const index = rowIndex(row);
  if (index !== null) {
    const box = row.getBoundingClientRect();
    return clientY > box.top + box.height / 2 ? index + 1 : index;
  }

  // Раскрытие относится к своей строке: вставка идёт после неё.
  let previous = row.previousElementSibling;
  while (previous && previous.classList.contains(EXPANSION_ROW_CLASS)) {
    previous = previous.previousElementSibling;
  }
  if (!(previous instanceof HTMLElement)) return 0;
  const previousIndex = rowIndex(previous);
  return previousIndex === null ? null : previousIndex + 1;
}

/** Граница вставки, когда указатель над пустым местом таблицы. */
export function boundaryInSpace(container: HTMLElement | null, clientY: number): number {
  const rows = firstRows(container);
  if (rows.length === 0) return 0;
  const last = rows[rows.length - 1].getBoundingClientRect();
  return clientY > last.bottom ? rows.length : 0;
}

/** Куда строка встанет после изъятия из списка. */
export function targetIndex(from: number, boundary: number): number {
  return boundary > from ? boundary - 1 : boundary;
}

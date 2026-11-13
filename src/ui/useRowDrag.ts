// Перенос строк таблицы перетаскиванием.
//
// Помощник не знает про инструмент: находит строки в контейнере, считает
// индексы, показывает место вставки и сообщает новую позицию. Таблица
// подключает его одним вызовом и остаётся свободной от логики переноса.
//
// Перенос идёт указателем, а не встроенным `drag-and-drop`: браузер не
// требует `draggable`, не рисует запрет над вложенными узлами и не теряет
// события между закреплённой и обычной частями таблицы.
//
// Включается явно (`enabled`). Чтобы отключить функцию, достаточно не
// включать её; чтобы удалить — убрать вызов, этот файл и `rowDrag.css`.

import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";
import "./rowDrag.css";

/** Поля и ссылки: с них перенос не начинается, они работают как обычно. */
const INTERACTIVE_SELECTOR =
  'input, textarea, select, a, [contenteditable="true"], [role="textbox"], ' +
  ".p-select, .p-inputtext";

/** Служебная строка раскрытия: в индексах строк не участвует. */
const EXPANSION_ROW_CLASS = "p-datatable-row-expansion";

/** Класс контейнера на время переноса: курсор и запрет выделения. */
const ACTIVE_CLASS = "row-drag--active";
/** Класс переносимой строки: она приглушается, чтобы не спорить с линией. */
const SOURCE_CLASS = "row-drag__source";
/** Линия места вставки: сверху или снизу строки. */
const LINE_TOP_CLASS = "row-drag__line-top";
const LINE_BOTTOM_CLASS = "row-drag__line-bottom";

/** Порог движения: нажатие без него остаётся кликом. */
const DRAG_THRESHOLD_PX = 4;
/** Полоса у края прокрутки, в которой таблица прокручивается сама. */
const AUTO_SCROLL_EDGE_PX = 32;
/** Шаг самопрокрутки за одно движение указателя. */
const AUTO_SCROLL_STEP_PX = 20;

export interface RowDragOptions {
  /** Выключатель переноса: без него перенос включён. */
  enabled?: () => boolean;
  /** Зона захвата внутри строки: перенос начинается только в ней. */
  grab?: string;
  /** Текущее число строк: по нему проверяются индексы и конец списка. */
  count: () => number;
  /** Новая позиция строки: индексы до и после её изъятия из списка. */
  reorder: (from: number, to: number) => void;
}

export function useRowDrag(
  container: Ref<HTMLElement | null>,
  options: RowDragOptions,
) {
  /** Индекс перетаскиваемой строки: `null` — переноса нет. */
  const dragIndex = ref<number | null>(null);
  /** Граница вставки: 0 — начало списка, `count` — конец. */
  const dropIndex = ref<number | null>(null);

  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  /** Строка, с которой началось нажатие. */
  let source: HTMLElement | null = null;
  let sourceIndex: number | null = null;
  /** Перенос начался: порог пройден. */
  let active = false;
  /** Ближайшая прокручиваемая область таблицы. */
  let scroller: HTMLElement | null = null;

  function isEnabled(): boolean {
    return options.enabled ? options.enabled() : true;
  }

  /** Строки данных тела таблицы: строки раскрытия пропускаются. */
  function dataRows(body: Element): HTMLElement[] {
    return [...body.children].filter(
      (node): node is HTMLElement =>
        node instanceof HTMLElement &&
        node.tagName === "TR" &&
        !node.classList.contains(EXPANSION_ROW_CLASS),
    );
  }

  /** Первое тело таблицы: по нему считаются границы вне строк. */
  function firstRows(): HTMLElement[] {
    const body = container.value?.querySelector("tbody");
    return body ? dataRows(body) : [];
  }

  /** Индекс строки внутри своего тела: у всех тел он совпадает. */
  function rowIndex(row: HTMLElement): number | null {
    const body = row.parentElement;
    if (!body) return null;
    const index = dataRows(body).indexOf(row);
    return index >= 0 ? index : null;
  }

  /** Строка под указателем: события приходят и от ячеек, и от вложенных узлов. */
  function rowOf(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    const row = target.closest<HTMLElement>("tr");
    return row && container.value?.contains(row) ? row : null;
  }

  /** Есть ли под указателем текст: его мышью выделяют, а не тянут. */
  function hasText(target: Element, row: HTMLElement): boolean {
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
  function boundaryAt(row: HTMLElement, clientY: number): number | null {
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
  function boundaryInSpace(clientY: number): number {
    const rows = firstRows();
    if (rows.length === 0) return 0;
    const last = rows[rows.length - 1].getBoundingClientRect();
    return clientY > last.bottom ? rows.length : 0;
  }

  /** Куда строка встанет после изъятия из списка. */
  function targetIndex(from: number, boundary: number): number {
    return boundary > from ? boundary - 1 : boundary;
  }

  /** Линия вставки: класс ставится строкам всех тел, чтобы подсветка была целой. */
  function showLine(boundary: number | null): void {
    const scope = container.value;
    if (!scope) return;

    for (const node of scope.querySelectorAll(
      `.${LINE_TOP_CLASS}, .${LINE_BOTTOM_CLASS}`,
    )) {
      node.classList.remove(LINE_TOP_CLASS, LINE_BOTTOM_CLASS);
    }
    if (boundary === null) return;

    const count = options.count();
    const bottom = boundary >= count;
    const markerIndex = bottom ? count - 1 : boundary;
    if (markerIndex < 0) return;

    const marker = bottom ? LINE_BOTTOM_CLASS : LINE_TOP_CLASS;
    for (const body of scope.querySelectorAll("tbody")) {
      dataRows(body)[markerIndex]?.classList.add(marker);
    }
  }

  /** Ближайшая прокручиваемая область: по её краям идёт самопрокрутка. */
  function scrollParentOf(element: HTMLElement): HTMLElement | null {
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
  function autoScroll(clientY: number): void {
    if (!scroller) return;
    const box = scroller.getBoundingClientRect();
    if (clientY < box.top + AUTO_SCROLL_EDGE_PX) {
      scroller.scrollTop -= AUTO_SCROLL_STEP_PX;
    } else if (clientY > box.bottom - AUTO_SCROLL_EDGE_PX) {
      scroller.scrollTop += AUTO_SCROLL_STEP_PX;
    }
  }

  /** Начало переноса: подсветка, курсор и кандидат на вставку. */
  function beginDrag(): boolean {
    const scope = container.value;
    if (!scope || !source || sourceIndex === null) return false;

    active = true;
    dragIndex.value = sourceIndex;
    dropIndex.value = null;
    scope.classList.add(ACTIVE_CLASS);
    source.classList.add(SOURCE_CLASS);
    document.body.style.cursor = "grabbing";
    scroller = scrollParentOf(source);
    window.getSelection()?.removeAllRanges();
    // Фокус с нажатой кнопки снимается: иначе Esc по переносу показал бы
    // на ней рамку фокуса вместо спокойной отмены.
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && scope.contains(focused)) focused.blur();
    window.addEventListener("keydown", onKeyDown);
    return true;
  }

  /** Место вставки под указателем: строка, пустое место или мимо таблицы. */
  function followPointer(target: EventTarget | null, clientY: number): void {
    const scope = container.value;
    if (!scope) return;
    autoScroll(clientY);

    const row = rowOf(target);
    const inside = target instanceof Node && scope.contains(target);
    const boundary = row
      ? boundaryAt(row, clientY)
      : inside
        ? boundaryInSpace(clientY)
        : null;
    if (boundary === null || dragIndex.value === null) {
      dropIndex.value = null;
      showLine(null);
      return;
    }

    dropIndex.value = boundary;
    const noop = targetIndex(dragIndex.value, boundary) === dragIndex.value;
    showLine(noop ? null : boundary);
  }

  /** Снимает перенос: слушатели, классы, линия и состояние. */
  function cleanup(): void {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
    window.removeEventListener("blur", cancel);
    window.removeEventListener("keydown", onKeyDown);

    container.value?.classList.remove(ACTIVE_CLASS);
    source?.classList.remove(SOURCE_CLASS);
    document.body.style.cursor = "";
    showLine(null);

    pointerId = null;
    source = null;
    sourceIndex = null;
    active = false;
    scroller = null;
    dragIndex.value = null;
    dropIndex.value = null;
  }

  /** Отмена без перестановки: Esc или потеря фокуса окна. */
  function cancel(): void {
    cleanup();
  }

  /** Завершение переноса: перестановка только при осмысленной границе. */
  function finish(commit: boolean): void {
    const from = dragIndex.value;
    const boundary = dropIndex.value;
    const moved = active;
    cleanup();
    if (!commit || !moved || from === null || boundary === null) return;

    const to = targetIndex(from, boundary);
    if (to === from || to < 0 || to >= options.count()) return;
    options.reorder(from, to);
  }

  function onPointerMove(event: PointerEvent): void {
    if (pointerId === null || event.pointerId !== pointerId) return;
    if (!active) {
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) {
        return;
      }
      if (!beginDrag()) return;
    }
    event.preventDefault();
    followPointer(event.target, event.clientY);
  }

  function onPointerUp(event: PointerEvent): void {
    if (pointerId === null || event.pointerId !== pointerId) return;
    finish(true);
  }

  function onPointerCancel(event: PointerEvent): void {
    if (pointerId === null || event.pointerId !== pointerId) return;
    finish(false);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") cancel();
  }

  function onPointerDown(event: PointerEvent): void {
    if (!isEnabled() || event.button !== 0 || event.pointerType === "touch") {
      return;
    }
    if (active) cleanup();

    const target = event.target;
    if (!(target instanceof Element)) return;
    const row = rowOf(target);
    if (!row) return;
    const index = rowIndex(row);
    if (index === null) return;
    if (target.closest(INTERACTIVE_SELECTOR)) return;

    // Текст остаётся для выделения: перенос начинается только с мест без него.
    if (hasText(target, row)) return;
    if (options.grab && target.closest(options.grab) === null) return;

    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    source = row;
    sourceIndex = index;

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("blur", cancel);
  }

  onMounted(() => {
    container.value?.addEventListener("pointerdown", onPointerDown);
  });

  onBeforeUnmount(() => {
    container.value?.removeEventListener("pointerdown", onPointerDown);
    cleanup();
  });

  return { dragIndex, dropIndex };
}

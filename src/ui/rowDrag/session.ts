// Сеанс переноса строки: указатель, порог, слушатели и завершение.
//
// Таблица подключает помощник одним вызовом и остаётся свободной от логики
// переноса. Перенос идёт указателем, а не встроенным `drag-and-drop`:
// браузер не требует `draggable`, не рисует запрет над вложенными узлами
// и не теряет события между закреплённой и обычной частями таблицы.

import { ref, type Ref } from "vue";
import { DRAG_THRESHOLD_PX, INTERACTIVE_SELECTOR } from "./constants";
import { clearSource, markSource, showLine } from "./feedback";
import {
  boundaryAt,
  boundaryInSpace,
  hasText,
  rowIndex,
  rowOf,
  targetIndex,
} from "./geometry";
import { autoScroll, scrollParentOf } from "./scroll";

/** Параметры переноса: их задаёт таблица. */
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

/** Состояние переноса, живущее вместе с компонентом. */
export interface RowDragSession {
  /** Индекс перетаскиваемой строки: `null` — переноса нет. */
  dragIndex: Ref<number | null>;
  /** Граница вставки: 0 — начало списка, `count` — конец. */
  dropIndex: Ref<number | null>;
  /** Подписка на нажатие: вызывается при монтировании таблицы. */
  attach(): void;
  /** Снятие подписки и подсветки: вызывается при размонтировании. */
  detach(): void;
}

/** Создаёт сеанс переноса для контейнера таблицы. */
export function createDragSession(
  container: Ref<HTMLElement | null>,
  options: RowDragOptions,
): RowDragSession {
  const dragIndex = ref<number | null>(null);
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

  /** Линия вставки: число строк нужно для подсветки конца списка. */
  function line(boundary: number | null): void {
    showLine(container.value, boundary, options.count());
  }

  /** Начало переноса: подсветка, курсор и кандидат на вставку. */
  function beginDrag(): boolean {
    const scope = container.value;
    if (!scope || !source || sourceIndex === null) return false;

    active = true;
    dragIndex.value = sourceIndex;
    dropIndex.value = null;
    markSource(scope, source);
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
    autoScroll(scroller, clientY);

    const row = rowOf(scope, target);
    const inside = target instanceof Node && scope.contains(target);
    const boundary = row
      ? boundaryAt(row, clientY)
      : inside
        ? boundaryInSpace(scope, clientY)
        : null;
    if (boundary === null || dragIndex.value === null) {
      dropIndex.value = null;
      line(null);
      return;
    }

    dropIndex.value = boundary;
    const noop = targetIndex(dragIndex.value, boundary) === dragIndex.value;
    line(noop ? null : boundary);
  }

  /** Снимает перенос: слушатели, классы, линия и состояние. */
  function cleanup(): void {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
    window.removeEventListener("blur", cancel);
    window.removeEventListener("keydown", onKeyDown);

    clearSource(container.value, source);
    line(null);

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

    const scope = container.value;
    if (!scope) return;
    const row = rowOf(scope, event.target);
    if (!row) return;
    const index = rowIndex(row);
    if (index === null) return;

    const target = event.target;
    if (!(target instanceof Element)) return;
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

  function attach(): void {
    container.value?.addEventListener("pointerdown", onPointerDown);
  }

  function detach(): void {
    container.value?.removeEventListener("pointerdown", onPointerDown);
    cleanup();
  }

  return { dragIndex, dropIndex, attach, detach };
}

// Перенос строк таблицы перетаскиванием.
//
// Помощник не знает про инструмент: находит строки в контейнере, считает
// индексы, показывает место вставки и сообщает новую позицию. Таблица
// подключает его одним вызовом и остаётся свободной от логики переноса.
//
// Внутри области: геометрия (`geometry`), подсветка (`feedback`), прокрутка
// (`scroll`) и сеанс указателя (`session`). Включается явно (`enabled`).
// Чтобы отключить функцию, достаточно не включать её; чтобы удалить — убрать
// вызов и папку `rowDrag`.

import { onBeforeUnmount, onMounted, type Ref } from "vue";
import { createDragSession, type RowDragOptions } from "./session";
import "./rowDrag.css";

export type { RowDragOptions } from "./session";

/** Подключение переноса строк к контейнеру таблицы. */
export function useRowDrag(
  container: Ref<HTMLElement | null>,
  options: RowDragOptions,
) {
  const session = createDragSession(container, options);

  onMounted(() => {
    session.attach();
  });

  onBeforeUnmount(() => {
    session.detach();
  });

  return { dragIndex: session.dragIndex, dropIndex: session.dropIndex };
}

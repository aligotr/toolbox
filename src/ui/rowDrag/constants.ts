// Классы, пороги и селекторы переноса строк.
//
// Всё, что связывает разметку таблицы с помощником, собрано здесь: таблица
// не знает ни имён классов, ни предела, после которого нажатие становится
// переносом.

/** Поля и ссылки: с них перенос не начинается, они работают как обычно. */
export const INTERACTIVE_SELECTOR =
  'input, textarea, select, a, [contenteditable="true"], [role="textbox"], ' +
  ".p-select, .p-inputtext";

/** Служебная строка раскрытия: в индексах строк не участвует. */
export const EXPANSION_ROW_CLASS = "p-datatable-row-expansion";

/** Класс контейнера на время переноса: курсор и запрет выделения. */
export const ACTIVE_CLASS = "row-drag--active";
/** Класс переносимой строки: она приглушается, чтобы не спорить с линией. */
export const SOURCE_CLASS = "row-drag__source";
/** Линия места вставки: сверху или снизу строки. */
export const LINE_TOP_CLASS = "row-drag__line-top";
export const LINE_BOTTOM_CLASS = "row-drag__line-bottom";

/** Порог движения: нажатие без него остаётся кликом. */
export const DRAG_THRESHOLD_PX = 4;
/** Полоса у края прокрутки, в которой таблица прокручивается сама. */
export const AUTO_SCROLL_EDGE_PX = 32;
/** Шаг самопрокрутки за одно движение указателя. */
export const AUTO_SCROLL_STEP_PX = 20;

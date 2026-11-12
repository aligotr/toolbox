// Склонение подписей с числительными.
//
// «1 инструмент», «2 инструмента», «5 инструментов» — одно правило на все
// места, где показывается количество: карточка шаблона, строки профилей
// и раздел «Данные». Иначе одна подпись говорила бы «2 инструментов».

/** Форма слова для количества: единственное, 2–4, остальное. */
function form(count: number, one: string, few: string, many: string): string {
  const tens = count % 100;
  const ones = count % 10;

  if (ones === 1 && tens !== 11) return one;
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return few;
  return many;
}

/** Подпись количества инструментов. */
export function toolsLabel(count: number): string {
  return `${count} ${form(count, "инструмент", "инструмента", "инструментов")}`;
}

/** Подпись количества шаблонов. */
export function templatesLabel(count: number): string {
  return `${count} ${form(count, "шаблон", "шаблона", "шаблонов")}`;
}

/** Подпись количества файлов. */
export function filesLabel(count: number): string {
  return `${count} ${form(count, "файл", "файла", "файлов")}`;
}

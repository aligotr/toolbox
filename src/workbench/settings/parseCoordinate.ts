// Разбор чисел окна из полей настроек: координаты и размера.
//
// Ядро принимает координату целым числом в диапазоне `i32`, а размер - целым
// в диапазоне `u32` и не пересчитывает их. Всё, что не помещается, отвергается
// здесь, до вызова: иначе ошибка пришла бы из команды без указания на поле.

/** Нижняя граница координаты окна: минимум `i32`. */
const MIN_COORDINATE = -2147483648;

/** Верхняя граница координаты окна: максимум `i32`. */
const MAX_COORDINATE = 2147483647;

/** Верхняя граница размера окна: максимум `u32`. */
const MAX_SIZE = 4294967295;

/** Минимальная ширина окна: совпадает с `minWidth` в `tauri.conf.json`. */
export const MIN_WINDOW_WIDTH = 960;

/** Минимальная высота окна: совпадает с `minHeight` в `tauri.conf.json`. */
export const MIN_WINDOW_HEIGHT = 640;

/** Причина отказа: пустое поле, не целое число или выход за пределы. */
export type NumberProblem = "empty" | "invalid" | "range";

/** Итог разбора: число или причина отказа. */
export type ParsedInteger = { value: number } | { problem: NumberProblem };

/** Разбор целого числа в заданных пределах. */
function parseInteger(input: string, min: number, max: number): ParsedInteger {
  const trimmed = input.trim();
  if (trimmed === "") return { problem: "empty" };
  if (!/^-?\d+$/.test(trimmed)) return { problem: "invalid" };

  const parsed = Number(trimmed);
  if (parsed < min || parsed > max) return { problem: "range" };

  return { value: parsed };
}

/** Координата окна из поля: пустое поле означает «положение выбирает система». */
export function parseCoordinate(value: string): ParsedInteger {
  return parseInteger(value, MIN_COORDINATE, MAX_COORDINATE);
}

/** Размер окна из поля: не меньше минимального и в пределах `u32`. */
export function parseSize(value: string, min: number): ParsedInteger {
  return parseInteger(value, min, MAX_SIZE);
}

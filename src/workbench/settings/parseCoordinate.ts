// Разбор координаты окна из поля настроек.
//
// Ядро принимает положение целым числом в диапазоне `i32` и не пересчитывает
// его. Всё, что не помещается в этот диапазон, отвергается здесь, до вызова:
// иначе ошибка пришла бы из команды без указания на поле.

/** Нижняя граница координаты окна: минимум `i32`. */
const MIN_COORDINATE = -2147483648;

/** Верхняя граница координаты окна: максимум `i32`. */
const MAX_COORDINATE = 2147483647;

/** Итог разбора: координата или причина отказа. */
export type ParsedCoordinate = { value: number } | { problem: "invalid" | "range" };

/** Координата из поля: число, `invalid` для нецелого и `range` за границей. */
export function parseCoordinate(value: string): ParsedCoordinate {
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) return { problem: "invalid" };

  const parsed = Number(trimmed);
  if (parsed < MIN_COORDINATE || parsed > MAX_COORDINATE) return { problem: "range" };

  return { value: parsed };
}

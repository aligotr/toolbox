// Проверки формы значения, общие для всех доменов.

/** Есть ли у значения вид объекта: массивы и `null` сюда не годятся. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

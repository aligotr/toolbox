// Подписи размеров для раздела «Данные».
//
// Размер приходит в байтах, а человек читает килобайты и мегабайты. Одна
// функция на все строки раздела: иначе «логи» и «шаблоны» считали бы
// округление по-разному.

/** Единицы от байта к гигабайту. */
const UNITS = ["Б", "КБ", "МБ", "ГБ"] as const;

/** Во сколько раз следующая единица больше предыдущей. */
const STEP = 1024;

/** Подпись размера: целые байты, дальше — одна десятая. */
export function formatBytes(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;

  while (value >= STEP && unit < UNITS.length - 1) {
    value /= STEP;
    unit += 1;
  }

  if (unit === 0) return `${Math.round(value)} ${UNITS[unit]}`;

  const rounded = value.toFixed(1).replace(".", ",");
  return `${rounded} ${UNITS[unit]}`;
}

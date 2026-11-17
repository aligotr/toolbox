// Подписи размеров для раздела «Данные».
//
// Размер приходит в байтах, а человек читает килобайты и мегабайты. Одна
// функция на все строки раздела: иначе «логи» и «данные» считали бы
// округление по-разному.
//
// Единицы и разделитель дробной части берутся из словаря и локали: в
// английском это «KB» и точка, в русском — «КБ» и запятая (ADR 0039).

import { catalog, formatNumber, t } from "@/core/infra/i18n";

/** Во сколько раз следующая единица больше предыдущей. */
const STEP = 1024;

/** Подпись единицы по её номеру: байт, килобайт, мегабайт, гигабайт. */
function unitLabel(unit: number): string {
  switch (unit) {
    case 0:
      return t("units.bytes");
    case 1:
      return t("units.kilobytes");
    case 2:
      return t("units.megabytes");
    default:
      return t("units.gigabytes");
  }
}

/** Подпись размера: целые байты, дальше — одна десятая. */
export function formatBytes(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;

  while (value >= STEP && unit < 3) {
    value /= STEP;
    unit += 1;
  }

  const rounded =
    unit === 0
      ? formatNumber(catalog.locale, Math.round(value))
      : formatNumber(catalog.locale, value, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        });

  return `${rounded} ${unitLabel(unit)}`;
}

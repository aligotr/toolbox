// Подписи времени прогона.
//
// Дробная часть и единица зависят от языка: в английском это «ms» и точка,
// в русском — «мс» и запятая (ADR 0039). Один помощник на панель и путь,
// иначе «Круговое время» и этапы считались бы по-разному.

import { catalog, formatNumber, t } from "@/core/infra/i18n";

/** Миллисекунды с фиксированной дробной частью и единицей. */
export function formatMs(value: number, digits: number): string {
  const number = formatNumber(catalog.locale, value, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${number} ${t("busprobe.unit.ms")}`;
}

// Подписи с числительными.
//
// «1 пресет», «2 пресета», «5 пресетов» — формы хранятся
// в словаре, а не в коде: у каждого языка свои правила склонения, и `t()`
// выбирает форму по ним (ADR 0039). Одно место на все подписи с количеством:
// строки профилей и раздел «Данные».

import { t } from "@/core/infra/i18n";

/** Подпись количества пресетов. */
export function presetsLabel(count: number): string {
  return t("count.presets", { count });
}

/** Подпись количества файлов. */
export function filesLabel(count: number): string {
  return t("count.files", { count });
}

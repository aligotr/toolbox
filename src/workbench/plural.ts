// Подписи с числительными.
//
// «1 инструмент», «2 инструмента», «5 инструментов» — формы хранятся
// в словаре, а не в коде: у каждого языка свои правила склонения, и `t()`
// выбирает форму по ним (ADR 0039). Одно место на все подписи с количеством:
// карточка шаблона, строки профилей и раздел «Данные».

import { t } from "@/core/infra/i18n";

/** Подпись количества инструментов. */
export function toolsLabel(count: number): string {
  return t("count.tools", { count });
}

/** Подпись количества шаблонов. */
export function templatesLabel(count: number): string {
  return t("count.templates", { count });
}

/** Подпись количества пресетов. */
export function presetsLabel(count: number): string {
  return t("count.presets", { count });
}

/** Подпись количества файлов. */
export function filesLabel(count: number): string {
  return t("count.files", { count });
}

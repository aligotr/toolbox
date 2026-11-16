// Подписи раздела «Журнал».
//
// Уровни перечислены от строгого к подробному: так пользователь видит, что
// выбор — шкала, а не набор несвязанных переключателей. Пояснение отвечает
// на вопрос «что попадёт в файл», а не повторяет название уровня. Подписи
// читаются из словаря при обращении, поэтому смена языка не требует
// перезапуска (ADR 0039).

import type { LogLevel } from "@/contracts/settings";
import { t } from "@/core/infra/i18n";

/** Один уровень в списке выбора. */
export interface LogLevelOption {
  value: LogLevel;
  label: string;
  hint: string;
}

/** Уровни файлового лога. */
export function logLevelOptions(): LogLevelOption[] {
  return [
    {
      value: "error",
      label: t("settings.log.level.error"),
      hint: t("settings.log.level.errorHint"),
    },
    {
      value: "warn",
      label: t("settings.log.level.warn"),
      hint: t("settings.log.level.warnHint"),
    },
    {
      value: "info",
      label: t("settings.log.level.info"),
      hint: t("settings.log.level.infoHint"),
    },
    {
      value: "debug",
      label: t("settings.log.level.debug"),
      hint: t("settings.log.level.debugHint"),
    },
  ];
}

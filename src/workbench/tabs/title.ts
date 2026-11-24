// Подписи вкладок.
//
// У рабочей вкладки название своё — инструмент. Служебные
// вкладки и пустая подписи не хранят: текст берётся из словаря при показе,
// поэтому смена языка перерисовывает и полосу вкладок (ADR 0039).

import type { WorkspaceTab } from "@/contracts/workspace";
import { SINGLETON_TABS } from "@/core/constants";
import { t } from "@/core/infra/i18n";

/** Подпись вкладки для полосы и диалогов. */
export function tabTitle(tab: WorkspaceTab): string {
  if (tab.kind !== "workspace") return t(SINGLETON_TABS[tab.kind].titleKey);
  return tab.title || t("common.newTab");
}

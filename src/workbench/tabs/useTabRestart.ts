// Перезапуск вкладки: подтверждение с потерей состояния и возврат пресетов.
//
// Действие разрушительное: несохранённые строки, результаты и настройки
// инструментов пропадут, поэтому спрашиваем подтверждение. Сама вкладка
// остаётся на месте: раскладка и привязка к шаблону переходят к новой копии
// (ADR 0031).

import { useConfirm } from "primevue/useconfirm";
import type { WorkspaceTab } from "@/contracts/workspace";
import { CONFIRM_CALM_REJECT } from "@/core/constants";
import { t } from "@/core/infra/i18n";
import { defaultPresetTitle, loadPresetDefaults } from "@/core/services/presets/index";
import { restartTab } from "@/core/services/workspace/index";

export function useTabRestart() {
  const confirm = useConfirm();

  /**
   * Пресеты по умолчанию для инструментов вкладки.
   *
   * Одинаковые названия повторяются один раз: в подтверждении важен список
   * пресетов, а не число ячеек.
   */
  function defaultTitlesOf(tab: WorkspaceTab): string[] {
    const titles = tab.columns
      .flatMap((column) => column.tools)
      .map((tool) => defaultPresetTitle(tool))
      .filter((title): title is string => title !== null);
    return [...new Set(titles)];
  }

  /**
   * Строка о пресетах по умолчанию: какие из них загрузятся после перезапуска.
   *
   * Упоминаются только заданные умолчания — иначе подсказка обещала бы пресет,
   * которого нет. `null` — умолчаний нет, строки в подтверждении не будет.
   */
  function restartDefaultsLine(titles: string[]): string | null {
    if (titles.length === 0) return null;
    if (titles.length === 1) return t("tabs.restart.presetOne", { title: titles[0] });
    return t("tabs.restart.presets", { titles: titles.join(", ") });
  }

  /** Спрашивает подтверждение и перезапускает вкладку на месте. */
  async function requestRestart(tab: WorkspaceTab): Promise<void> {
    // Названия умолчаний известны только после чтения списков: без него
    // подтверждение не смогло бы сказать, какой пресет загрузится.
    await loadPresetDefaults();

    const lines = [t("tabs.restart.loss")];
    const defaults = restartDefaultsLine(defaultTitlesOf(tab));
    if (defaults !== null) lines.push(defaults);
    lines.push(t("tabs.restart.keep"));

    confirm.require({
      header: t("tabs.restart.header"),
      message: lines.join("\n"),
      acceptLabel: t("tabs.restart.accept"),
      rejectLabel: t("tabs.restart.reject"),
      rejectProps: CONFIRM_CALM_REJECT,
      accept: () => restartTab(tab.id),
    });
  }

  return { requestRestart };
}

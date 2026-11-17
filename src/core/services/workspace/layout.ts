// Разбор геометрии вкладки.
//
// Один и тот же массив колонок приходит из памяти и из `local/workspace.json`,
// а хранить два разбора — значит однажды починить битую колонку только
// в одном из них. Правила проверки живут здесь.

import type { TabColumn } from "@/contracts/workspace";
import { isRecord } from "../../infra/guards";

/**
 * Разбирает колонки вкладки.
 *
 * Битые элементы пропускаются: одна испорченная колонка не должна отменять
 * остальные. Ширина меньше нуля невозможна — раскладка считает доли,
 * и отрицательное значение сломало бы её.
 */
export function parseColumns(value: unknown): TabColumn[] {
  if (!Array.isArray(value)) return [];

  const columns: TabColumn[] = [];
  for (const item of value) {
    if (!isRecord(item) || !Array.isArray(item.tools)) continue;

    const width =
      typeof item.width === "number" && Number.isFinite(item.width) && item.width > 0
        ? item.width
        : 1;
    const tools = item.tools.filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    );
    columns.push({ width, tools });
  }
  return columns;
}

/** Копия колонок для записи: прокси Vue в файл и в мост не отдаётся. */
export function copyColumns(columns: TabColumn[]): TabColumn[] {
  return columns.map((column) => ({
    width: column.width,
    tools: [...column.tools],
  }));
}

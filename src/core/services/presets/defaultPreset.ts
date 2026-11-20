// Подпись пресета по умолчанию для экрана запуска.
//
// Экран запуска показывает, что загрузится в новую вкладку инструмента
// (ADR 0062), но пресеты не ведёт: читает указатель и список общими
// командами по идентификатору инструмента. Оболочка имён инструментов
// не знает, инструмент о карточке не знает.
//
// Чтение отдельное от состояния `createPresets`: экрану запуска нужен
// только заголовок, а не операции и статусы.

import { JOURNAL_CORE_SOURCE } from "@/core/infra/constants";
import { write } from "@/core/infra/journal";
import { readPresetFiles } from "./index";

/**
 * Название пресета по умолчанию; `null` - умолчания нет или оно не прочитано.
 *
 * Подпись необязательна: отказ команды скрывает её, но не мешает открыть
 * инструмент. Причина отказа уходит в журнал, чтобы пропажа строки
 * не выглядела нормой. Битый файл пресета или указателя тоже скрывает
 * подпись: причину называет инструмент, когда его открывают.
 */
export async function defaultPresetTitle(tool: string): Promise<string | null> {
  try {
    const { list, pointer } = await readPresetFiles(tool);

    if (pointer.id === null) return null;
    return list.items.find((item) => item.id === pointer.id)?.title ?? null;
  } catch (error) {
    write(JOURNAL_CORE_SOURCE, "error", "journal.presets.readError", {
      tool,
      reason: error,
    });
    return null;
  }
}

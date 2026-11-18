// Уход за файлами лога.
//
// Лог отвечает на вопрос «почему приложение или его функция не сработали».
// Чистка идёт по возрасту: свежие записи нужны для разбора, старые — нет.
// Срок хранения задаёт ядро, поэтому подпись кнопки и действие не расходятся.

import { invoke } from "@tauri-apps/api/core";
import { reactive } from "vue";
import { JOURNAL_CORE_SOURCE } from "../infra/constants";
import { describeError } from "../infra/errors";
import { write } from "../infra/journal";
import { idle, type OperationStatus } from "../infra/status";

/** Состояние чистки логов. */
export const status = reactive<Record<"prune", OperationStatus>>({
  prune: idle(),
});

/**
 * Удаляет старые файлы лога и возвращает их число.
 *
 * `null` — отказ: ноль означает «удалять было нечего», и путать эти ответы
 * нельзя.
 */
export async function pruneLogs(): Promise<number | null> {
  if (status.prune.loading) return null;

  status.prune.loading = true;
  status.prune.error = null;
  try {
    const removed = await invoke<number>("logs_prune");
    write(JOURNAL_CORE_SOURCE, "result", "journal.logs.pruned", {
      count: removed,
    });
    return removed;
  } catch (error) {
    status.prune.error = describeError(error);
    write(JOURNAL_CORE_SOURCE, "error", "journal.logs.pruneError", {
      reason: error,
    });
    return null;
  } finally {
    status.prune.loading = false;
  }
}

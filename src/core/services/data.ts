// Размеры папок и данные инструментов.
//
// Раздел «Данные» показывает, сколько занимают лог, шаблоны и данные
// инструментов активного профиля. Удаление — переносом в
// `local/trash/data/`: данные бывают единственной копией списка, и промах
// в списке не должен их стирать.
//
// После удаления размеры перечитываются здесь же: экран не должен показывать
// папку, которой уже нет.

import { invoke } from "@tauri-apps/api/core";
import { reactive } from "vue";
import type { StorageStats } from "@/contracts/data";
import { JOURNAL_CORE_SOURCE } from "../infra/constants";
import { describeError } from "../infra/errors";
import { write } from "../infra/journal";
import { idle, type OperationStatus } from "../infra/status";

/** Состояние размеров. */
export interface StorageStatsState {
  current: StorageStats | null;
  loaded: boolean;
}

/** Размеры логов, шаблонов и данных инструментов. */
export const storageStats = reactive<StorageStatsState>({
  current: null,
  loaded: false,
});

/** Состояния операций: чтение размеров, очистка логов, удаление данных. */
export const status = reactive<Record<"load" | "prune" | "clear", OperationStatus>>({
  load: idle(),
  prune: idle(),
  clear: idle(),
});

/** Перечитывает размеры папок. */
export async function loadStorageStats(): Promise<void> {
  if (status.load.loading) return;

  status.load.loading = true;
  status.load.error = null;
  try {
    storageStats.current = await invoke<StorageStats>("storage_stats");
    storageStats.loaded = true;
  } catch (error) {
    status.load.error = describeError(error);
    write(JOURNAL_CORE_SOURCE, "error", "journal.data.readError", {
      reason: error,
    });
  } finally {
    status.load.loading = false;
  }
}

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
    write(JOURNAL_CORE_SOURCE, "result", "journal.data.pruned", {
      count: removed,
    });
    await loadStorageStats();
    return removed;
  } catch (error) {
    status.prune.error = describeError(error);
    write(JOURNAL_CORE_SOURCE, "error", "journal.data.pruneError", {
      reason: error,
    });
    return null;
  } finally {
    status.prune.loading = false;
  }
}

/** Переносит данные инструмента в корзину и перечитывает размеры. */
export async function clearToolData(tool: string): Promise<boolean> {
  if (status.clear.loading) return false;

  status.clear.loading = true;
  status.clear.error = null;
  try {
    const target = await invoke<string>("tool_data_clear", { tool });
    write(JOURNAL_CORE_SOURCE, "result", "journal.data.cleared", {
      tool,
      target,
    });
    await loadStorageStats();
    return true;
  } catch (error) {
    status.clear.error = describeError(error);
    write(JOURNAL_CORE_SOURCE, "error", "journal.data.clearError", {
      tool,
      reason: error,
    });
    return false;
  } finally {
    status.clear.loading = false;
  }
}

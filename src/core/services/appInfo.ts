// Сведения о программе и открытие папок в проводнике.
//
// Пути выбирает ядро: рабочая папка может лежать на сетевой шаре, и собирать
// её в интерфейсе из частей значило бы повторить раскладку хранилища.
// Команда `open_folder` принимает имя папки, а не путь — окно не может
// попросить открыть произвольный каталог.

import { invoke } from "@tauri-apps/api/core";
import { reactive } from "vue";
import type { AppInfo } from "@/contracts/app";
import { JOURNAL_CORE_SOURCE } from "../infra/constants";
import { describeError } from "../infra/errors";
import { write } from "../infra/journal";
import { idle, type OperationStatus } from "../infra/status";

/** Папки, которые умеет открывать ядро. */
export type FolderKind = "logs" | "root" | "languages";

/** Состояние сведений о программе. */
export interface AppInfoState {
  current: AppInfo | null;
  loaded: boolean;
}

/** Общие сведения о программе: их читают разделы «Журнал» и «Программа». */
export const appInfo = reactive<AppInfoState>({
  current: null,
  loaded: false,
});

/** Состояния операций: чтение сведений и открытие папки. */
export const status = reactive<Record<"load" | "folder", OperationStatus>>({
  load: idle(),
  folder: idle(),
});

/**
 * Читает сведения о программе.
 *
 * Ошибка не стирает прочитанное: версия и папки не меняются между вызовами,
 * и пустые поля выглядели бы поломкой запуска.
 */
export async function loadAppInfo(): Promise<void> {
  if (status.load.loading) return;

  status.load.loading = true;
  status.load.error = null;
  try {
    appInfo.current = await invoke<AppInfo>("app_info");
    appInfo.loaded = true;
  } catch (error) {
    status.load.error = describeError(error);
    write(JOURNAL_CORE_SOURCE, "error", "journal.app.infoError", {
      reason: error,
    });
  } finally {
    status.load.loading = false;
  }
}

/** Открывает папку программы или логов в проводнике. */
export async function openFolder(kind: FolderKind): Promise<boolean> {
  if (status.folder.loading) return false;

  status.folder.loading = true;
  status.folder.error = null;
  try {
    await invoke("open_folder", { kind });
    return true;
  } catch (error) {
    status.folder.error = describeError(error);
    write(JOURNAL_CORE_SOURCE, "error", "journal.app.folderError", {
      reason: error,
    });
    return false;
  } finally {
    status.folder.loading = false;
  }
}

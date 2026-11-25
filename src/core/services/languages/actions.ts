// Действия со словарями: выгрузка, возврат, файл изменений и образец.
//
// Внешний файл принадлежит пользователю и не перезаписывается. Файл
// изменений - артефакт программы: его пишет ядро, оно же уведомляет
// о записи (ADR 0057, ADR 0058).

import { invoke } from "@tauri-apps/api/core";
import type { UpdatesResult } from "@/contracts/languages";
import { JOURNAL_CORE_SOURCE } from "../../infra/constants";
import { appErrorOf, describeError } from "../../infra/errors";
import { ruMessages } from "../../infra/i18n/messages";
import { write } from "../../infra/journal";
import { notify, notifyError } from "../../infra/notifications";
import {
  BUILTIN_LANGUAGE,
  BUILTIN_LANGUAGE_NAME,
  builtinLanguage,
  updatesDocument,
  type LanguageEntry,
} from "./model";
import { loadLanguages, status } from "./state";

/**
 * Выгружает встроенный язык во внешний файл.
 *
 * Существующий файл не перезаписывается: это уже словарь пользователя.
 */
export async function exportLanguage(code: string): Promise<string | null> {
  if (status.export.loading) return null;

  const language = builtinLanguage(code);
  if (!language) return null;

  status.export.loading = true;
  status.export.error = null;
  try {
    const path = await invoke<string>("language_export_file", {
      code,
      document: { name: language.name, messages: language.messages },
    });
    await loadLanguages();
    notify({
      kind: "info",
      code: "notifications.languages.exported",
      params: { code, file: fileNameOf(path) },
      group: "language-export",
    });
    return path;
  } catch (error) {
    notifyError(error, "language-export");
    write(JOURNAL_CORE_SOURCE, "error", "journal.languages.exportError", {
      reason: error,
    });
    return null;
  } finally {
    status.export.loading = false;
  }
}

/** Имя файла из пути: уведомлению не нужен полный путь. */
function fileNameOf(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index === -1 ? path : path.slice(index + 1);
}

/** Возвращает встроенный язык: внешний файл удаляется. */
export async function revertLanguage(code: string): Promise<string | null> {
  if (status.revert.loading) return null;

  status.revert.loading = true;
  status.revert.error = null;
  try {
    const target = await invoke<string>("language_revert", { code });
    await loadLanguages();
    return target;
  } catch (error) {
    status.revert.error = describeError(error);
    write(JOURNAL_CORE_SOURCE, "error", "journal.languages.revertError", {
      reason: error,
    });
    return null;
  } finally {
    status.revert.loading = false;
  }
}

/** Итог записи файла изменений из ядра. */
export type { UpdatesResult };

/**
 * Выгружает изменения словаря: что добавить и что убрать.
 *
 * `document` = `null` убирает файл, когда изменений нет. Запись и уведомление
 * о ней делает ядро: файл изменений - его артефакт. Исходы без записи
 * уведомляет интерфейс, чтобы каждое нажатие получало ответ.
 */
export async function exportUpdates(entry: LanguageEntry): Promise<UpdatesResult | null> {
  if (status.updates.loading) return null;

  status.updates.loading = true;
  status.updates.error = null;
  try {
    const result = await invoke<UpdatesResult>("language_updates_write", {
      code: entry.code,
      document: updatesDocument(entry),
    });

    // О записи файла уведомляет ядро. Здесь - исходы без записи: файл
    // уже актуален или изменений нет и устаревший файл убран.
    if (!result.written) {
      const group = `language-updates-${entry.code}`;
      if (result.path === null) {
        notify({ kind: "info", code: "notifications.languages.updatesNone", group });
      } else {
        notify({ kind: "info", code: "notifications.languages.updatesActual", group });
      }
    }
    return result;
  } catch (error) {
    status.updates.error = describeError(error);
    write(JOURNAL_CORE_SOURCE, "error", "journal.languages.updatesError", {
      reason: error,
    });
    return null;
  } finally {
    status.updates.loading = false;
  }
}

/**
 * Выгружает образец русского словаря.
 *
 * Существующий файл не перезаписывается: образец создаётся только один раз,
 * правки пользователя важнее свежести шаблона.
 */
export async function exportLanguageSample(): Promise<string | null> {
  if (status.export.loading) return null;

  status.export.loading = true;
  status.export.error = null;
  try {
    const path = await invoke<string>("language_export", {
      code: BUILTIN_LANGUAGE,
      document: { name: BUILTIN_LANGUAGE_NAME, messages: ruMessages },
    });
    notify({
      kind: "info",
      code: "notifications.languages.sampleSaved",
      params: { file: fileNameOf(path) },
      group: "language-sample",
    });
    return path;
  } catch (error) {
    const coded = appErrorOf(error);
    if (coded.code === "errors.languages.exists") {
      // Образец не перезаписывается намеренно: это не отказ, а напоминание.
      notify({
        kind: "info",
        code: "notifications.languages.sampleExists",
        params: { file: fileNameOf(coded.params.path ?? "") },
        group: "language-sample",
      });
    } else {
      notifyError(error, "language-sample");
      write(JOURNAL_CORE_SOURCE, "error", "journal.languages.exportError", {
        reason: error,
      });
    }
    return null;
  } finally {
    status.export.loading = false;
  }
}

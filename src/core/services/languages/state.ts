// Состояние словарей: каталог внешних файлов, счётчики и кэш сообщений.
//
// Каталог читается один раз за обращение: ядро отдаёт сообщения вместе
// со сведениями о файле (ADR 0057). Кэш нужен переключению языка и стартовой
// проверке, чтобы не читать активный файл повторно.

import { invoke } from "@tauri-apps/api/core";
import { reactive } from "vue";
import type { CatalogEntry } from "@/contracts/languages";
import { JOURNAL_CORE_SOURCE } from "../../infra/constants";
import { describeError } from "../../infra/errors";
import { isLocaleTag } from "../../infra/i18n";
import { write } from "../../infra/journal";
import { idle, type OperationStatus } from "../../infra/status";
import {
  BUILTIN_LANGUAGES,
  missingKeysOf,
  sourceFor,
  type BuiltinLanguage,
  type DictionaryFile,
  type LanguageEntry,
} from "./model";

/** Состояние списка словарей. */
interface LanguagesState {
  items: LanguageEntry[];
  loaded: boolean;
}

/** Строки списка: два встроенных языка и внешние файлы. */
export const languages = reactive<LanguagesState>({
  items: [],
  loaded: false,
});

/** Состояния операций: каталог, выгрузка, возврат, дополнения. */
export const status = reactive<Record<"list" | "export" | "revert" | "missing", OperationStatus>>({
  list: idle(),
  export: idle(),
  revert: idle(),
  missing: idle(),
});

/** Прочитанные внешние словари: переключение не перечитывает файл. */
export const cache = new Map<string, DictionaryFile>();

/** Текущее чтение каталога: повторный вызов ждёт его, а не начинает второе. */
let pending: Promise<void> | null = null;

/**
 * Читает каталог внешних словарей и считает расхождение с источником.
 *
 * Ошибка одного файла не мешает остальным: причина попадает в строку списка,
 * а не в общий отказ.
 */
export function loadLanguages(): Promise<void> {
  pending ??= readLanguages().finally(() => {
    pending = null;
  });
  return pending;
}

/** Читает каталог и собирает строки: встроенные первыми. */
async function readLanguages(): Promise<void> {
  status.list.loading = true;
  status.list.error = null;
  try {
    const files = await invoke<CatalogEntry[]>("languages_catalog");
    const byCode = new Map(files.map((file) => [file.code, file]));
    cache.clear();

    const items: LanguageEntry[] = BUILTIN_LANGUAGES.map((language) => {
      const file = byCode.get(language.code);
      byCode.delete(language.code);
      return file
        ? entryOfFile(file, language)
        : {
            code: language.code,
            name: language.name,
            nameKey: language.nameKey,
            problem: null,
            missing: 0,
            extra: 0,
            builtin: true,
            overrides: false,
            messages: null,
          };
    });

    for (const file of byCode.values()) items.push(entryOfFile(file, null));

    languages.items = items;
    languages.loaded = true;
  } catch (error) {
    status.list.error = describeError(error);
    write(JOURNAL_CORE_SOURCE, "error", "journal.languages.readError", {
      reason: error,
    });
  } finally {
    status.list.loading = false;
  }
}

/** Строка списка по прочитанному файлу. */
function entryOfFile(file: CatalogEntry, builtin: BuiltinLanguage | null): LanguageEntry {
  const base: LanguageEntry = {
    code: file.code,
    name: builtin?.name ?? file.name,
    ...(builtin ? { nameKey: builtin.nameKey } : {}),
    problem: file.problem,
    missing: 0,
    extra: 0,
    builtin: builtin !== null,
    overrides: builtin !== null,
    messages: file.messages,
  };

  if (file.problem !== null || file.messages === null) return base;

  // Код - часть контракта: файл `pt_BR.json` прочитался бы, но склонения
  // для него `Intl` не знает, и текст пошёл бы с русскими формами.
  if (!isLocaleTag(file.code)) {
    return {
      ...base,
      problem: {
        code: "settings.language.badCode",
        params: { code: file.code },
        fallback: `код '${file.code}' не является тегом языка`,
      },
    };
  }

  cache.set(file.code, { name: file.name, messages: file.messages });

  return {
    ...base,
    missing: missingKeysOf(file.code, file.messages).length,
    extra: Object.keys(file.messages).filter((key) => !(key in sourceFor(file.code))).length,
  };
}

// Работа со словарём во время работы: включение языка и стартовая проверка.
//
// Внешний файл читается из кэша каталога или отдельной командой на старте.
// Пропуски считаются по встроенному языку того же кода, иначе по русскому
// (ADR 0039, ADR 0057).

import { invoke } from "@tauri-apps/api/core";
import type { AppError } from "@/contracts/errors";
import type { LanguageDocument, MissingResult } from "@/contracts/languages";
import { JOURNAL_CORE_SOURCE } from "../../infra/constants";
import { appErrorOf } from "../../infra/errors";
import { isLocaleTag, setCatalog, type Messages } from "../../infra/i18n";
import { ruMessages } from "../../infra/i18n/messages";
import { write } from "../../infra/journal";
import { BUILTIN_LANGUAGE, builtinMessages, mergeMessages, missingDocumentFor } from "./model";
import { cache, languages } from "./state";

/**
 * Включает язык.
 *
 * Неизвестный или битый файл откатывает интерфейс на русский, но выбор
 * в настройках не меняет: причину покажет раздел «Язык».
 */
export async function activateLanguage(code: string | null): Promise<string> {
  const wanted = code ?? BUILTIN_LANGUAGE;
  const builtin = builtinMessages(wanted);

  if (!builtin && !isLocaleTag(wanted)) {
    return unavailable(wanted);
  }

  const external = await readExternal(wanted);
  if (external.problem !== null) return unavailable(wanted);

  if (external.messages === null && builtin === null) {
    return unavailable(wanted);
  }

  // Встроенный слой лежит под внешним: пропуск внешнего файла показывается
  // на языке того же кода, а не сразу по-русски (ADR 0057).
  setCatalog(wanted, mergeMessages(builtin, external.messages));
  return wanted;
}

/**
 * Проверяет активный внешний словарь при запуске.
 *
 * Недостающие ключи пишет и сравнивает ядро: совпавший файл не переписывается
 * и уведомления не даёт, поэтому повторный старт молчит (ADR 0057).
 */
export async function checkLanguageFile(code: string | null): Promise<void> {
  const wanted = code ?? BUILTIN_LANGUAGE;

  // Встроенный язык без внешнего файла уже прочитан при сборке каталога:
  // второй запрос к ядру ничего не добавит.
  if (builtinMessages(wanted) !== null && !cache.has(wanted)) return;

  const external = await readExternal(wanted);

  // Битый файл и отсутствие внешнего файла: дополнять нечего.
  if (external.problem !== null || external.messages === null) return;

  const document = missingDocumentFor(wanted, external.name ?? wanted, external.messages);

  try {
    const result = await invoke<MissingResult>("language_missing_write", {
      code: wanted,
      document,
    });
    if (result.written) {
      write(JOURNAL_CORE_SOURCE, "info", "journal.languages.missingFound", {
        code: wanted,
        count: result.count,
      });
    }
  } catch (error) {
    write(JOURNAL_CORE_SOURCE, "error", "journal.languages.missingError", {
      reason: error,
    });
  }
}

/** Прочитанный внешний файл: имя, сообщения и причина отказа. */
interface ExternalFile {
  name: string | null;
  messages: Messages | null;
  problem: AppError | null;
}

/** Читает внешний файл: из кэша, каталога или отдельной командой на старте. */
async function readExternal(code: string): Promise<ExternalFile> {
  const cached = cache.get(code);
  if (cached) return { ...cached, problem: null };

  if (languages.loaded) {
    const entry = languages.items.find((item) => item.code === code);
    if (entry) {
      return {
        name: entry.name,
        messages: entry.problem === null ? entry.messages : null,
        problem: entry.problem,
      };
    }
  }

  try {
    const file = await invoke<LanguageDocument | null>("language_load", { code });
    if (file === null) return { name: null, messages: null, problem: null };
    const loaded = { name: file.name, messages: file.messages };
    cache.set(code, loaded);
    return { ...loaded, problem: null };
  } catch (error) {
    return { name: null, messages: null, problem: appErrorOf(error) };
  }
}

/** Откат на русский с записью причины в журнал. */
function unavailable(code: string): string {
  write(JOURNAL_CORE_SOURCE, "error", "journal.languages.unavailable", {
    code,
  });
  setCatalog(BUILTIN_LANGUAGE, ruMessages);
  return BUILTIN_LANGUAGE;
}

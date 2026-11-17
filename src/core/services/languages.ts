// Словари интерфейса: список внешних файлов и переключение каталога (ADR 0039).
//
// Разбирает файлы Rust: один диалект JSONC на обе стороны, а ошибка приходит
// с номером строки. Русский встроен в код и служит эталоном; внешний словарь
// накладывается сверху, а непереведённый ключ откатывается на русский.

import { invoke } from "@tauri-apps/api/core";
import { reactive } from "vue";
import type {
  DictionaryMessage,
  LanguageDocument,
  LanguageSummary,
} from "@/contracts/languages";
import type { AppError } from "@/contracts/errors";
import { JOURNAL_CORE_SOURCE } from "../infra/constants";
import { appErrorOf, describeError } from "../infra/errors";
import {
  DEFAULT_LOCALE,
  isLocaleTag,
  pluralCategories,
  setCatalog,
  type Messages,
  type PluralCategory,
} from "../infra/i18n";
import { ruMessages } from "../infra/i18n/messages";
import { write } from "../infra/journal";
import { idle, type OperationStatus } from "../infra/status";

/**
 * Язык встроенного словаря: он же эталон ключей и последний рубеж отката.
 *
 * Берётся из механизма, чтобы «русский по умолчанию» не разошёлся
 * в двух константах.
 */
export const BUILTIN_LANGUAGE = DEFAULT_LOCALE;

/** Название встроенного языка для выгружаемого образца. */
export const BUILTIN_LANGUAGE_NAME = "Русский";

/** Строка списка языков: файл и его состояние. */
export interface LanguageEntry {
  code: string;
  name: string;
  /** Причина, по которой файл не прочитан; `null` — словарь годен. */
  problem: AppError | null;
  /** Ключи русского словаря, которых нет в файле или у которых нет нужной формы. */
  missing: number;
  /** Ключи файла, которых нет в русском словаре. */
  extra: number;
}

/** Состояние списка словарей. */
interface LanguagesState {
  items: LanguageEntry[];
  loaded: boolean;
}

/** Найденные внешние словари: встроенного русского здесь нет. */
export const languages = reactive<LanguagesState>({
  items: [],
  loaded: false,
});

/** Состояния операций: список и выгрузка образца. */
export const status = reactive<Record<"list" | "export", OperationStatus>>({
  list: idle(),
  export: idle(),
});

/** Ключи эталона: по ним считается отчёт внешнего словаря. */
const referenceKeys = Object.keys(ruMessages);
const referenceSet = new Set(referenceKeys);

/** Прочитанные словари: переключение не перечитывает файл. */
const cache = new Map<string, Messages>();

/** Текущее чтение списка: повторный вызов ждёт его, а не начинает второе. */
let pending: Promise<void> | null = null;

/**
 * Читает список словарей и содержимое каждого.
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

/** Читает все словари папки и обновляет кэш. */
async function readLanguages(): Promise<void> {
  status.list.loading = true;
  status.list.error = null;
  try {
    const summaries = await invoke<LanguageSummary[]>("languages_list");
    languages.items = await Promise.all(summaries.map(readEntry));
    languages.loaded = true;
  } catch (error) {
    status.list.error = describeError(error);
    write(
      JOURNAL_CORE_SOURCE,
      "error",
      `словари не прочитаны: ${status.list.error}`,
    );
  } finally {
    status.list.loading = false;
  }
}

/** Дочитывает один словарь и считает расхождение с русским эталоном. */
async function readEntry(summary: LanguageSummary): Promise<LanguageEntry> {
  const base: LanguageEntry = { ...summary, missing: 0, extra: 0 };
  if (summary.problem !== null) return base;

  // Код — часть контракта: файл `pt_BR.json` прочитался бы, но склонения
  // для него `Intl` не знает, и текст пошёл бы с русскими формами.
  if (!isLocaleTag(summary.code)) {
    return {
      ...base,
      problem: {
        code: "settings.language.badCode",
        params: { code: summary.code },
        fallback: `код '${summary.code}' не является тегом языка`,
      },
    };
  }

  try {
    const file = await invoke<LanguageDocument>("language_load", {
      code: summary.code,
    });
    cache.set(summary.code, file.messages);

    const categories = pluralCategories(summary.code);
    const keys = Object.keys(file.messages);

    return {
      ...summary,
      name: file.name,
      missing: referenceKeys.filter(
        (key) => !isTranslated(key, file.messages, categories),
      ).length,
      extra: keys.filter((key) => !referenceSet.has(key)).length,
    };
  } catch (error) {
    // Файл исчез между списком и чтением: это та же недоступность словаря.
    return { ...base, problem: appErrorOf(error) };
  }
}

/**
 * Переведён ли ключ.
 *
 * У строки сравнивать нечего, а у набора форм проверяется полнота по
 * категориям языка файла: английскому хватает `one` и `other`, русскому
 * нужны ещё `few` и `many`. Пропущенная категория — это пропуск, иначе
 * бейдж «переведён полностью» врал бы.
 */
function isTranslated(
  key: string,
  messages: Record<string, DictionaryMessage>,
  categories: PluralCategory[],
): boolean {
  const reference = ruMessages[key];
  const value = messages[key];

  if (value === undefined) return false;
  if (typeof reference !== "object") return true;
  if (typeof value !== "object") return false;

  return categories.every((category) => typeof value[category] === "string");
}

/**
 * Включает язык.
 *
 * Неизвестный или битый файл откатывает интерфейс на русский, но выбор
 * в настройках не меняет: причину покажет раздел «Язык».
 */
export async function activateLanguage(code: string | null): Promise<string> {
  const wanted = code ?? BUILTIN_LANGUAGE;

  // Встроенный словарь не требует файлов: вне Tauri и на заблокированном
  // старте это единственный доступный язык, и он не должен давать ошибок.
  if (wanted === BUILTIN_LANGUAGE) {
    setCatalog(BUILTIN_LANGUAGE, ruMessages);
    return BUILTIN_LANGUAGE;
  }

  if (!languages.loaded) await loadLanguages();

  const entry = languages.items.find((item) => item.code === wanted);
  const messages = cache.get(wanted);

  if (!entry || entry.problem !== null || !messages) {
    write(
      JOURNAL_CORE_SOURCE,
      "error",
      `словарь '${wanted}' недоступен: интерфейс показывает русский`,
    );
    setCatalog(BUILTIN_LANGUAGE, ruMessages);
    return BUILTIN_LANGUAGE;
  }

  setCatalog(wanted, messages);
  return wanted;
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
    return await invoke<string>("language_export", {
      code: BUILTIN_LANGUAGE,
      document: { name: BUILTIN_LANGUAGE_NAME, messages: ruMessages },
    });
  } catch (error) {
    status.export.error = describeError(error);
    write(
      JOURNAL_CORE_SOURCE,
      "error",
      `образец словаря не выгружен: ${status.export.error}`,
    );
    return null;
  } finally {
    status.export.loading = false;
  }
}

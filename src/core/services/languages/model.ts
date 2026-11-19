// Модель языков: встроенные словари, цепочка отката и файл дополнений.
//
// Чистые функции без Vue и Tauri: по ним считаются пропуски, собирается
// документ дополнений и накладывается внешний файл на встроенный
// (ADR 0039, ADR 0057). Состояние и команды живут рядом, в `state.ts`,
// `runtime.ts` и `actions.ts`.

import type { AppError } from "@/contracts/errors";
import type { DictionaryMessage } from "@/contracts/languages";
import { DEFAULT_LOCALE, pluralCategories } from "../../infra/i18n/locale";
import type { Messages, PluralCategory } from "../../infra/i18n/types";
import { enMessages } from "../../infra/i18n/messages.en";
import { ruMessages } from "../../infra/i18n/messages";

/** Язык встроенного словаря: он же эталон ключей и последний рубеж отката. */
export const BUILTIN_LANGUAGE = DEFAULT_LOCALE;

/** Название русского словаря для выгружаемого образца. */
export const BUILTIN_LANGUAGE_NAME = "Русский";

/** Встроенный язык: код, название для файла и сообщения. */
export interface BuiltinLanguage {
  code: string;
  /** Название на самом языке: так оно попадает в выгруженный словарь. */
  name: string;
  /** Ключ подписи в списке: переводится при показе. */
  nameKey: string;
  messages: Messages;
}

/** Встроенные языки: русский эталон и английский перевод. */
export const BUILTIN_LANGUAGES: BuiltinLanguage[] = [
  {
    code: "ru",
    name: BUILTIN_LANGUAGE_NAME,
    nameKey: "settings.language.russian",
    messages: ruMessages,
  },
  {
    code: "en",
    name: "English",
    nameKey: "settings.language.english",
    messages: enMessages,
  },
];

/** Встроенный словарь по коду; `null` - язык только внешний. */
export function builtinMessages(code: string): Messages | null {
  return BUILTIN_LANGUAGES.find((language) => language.code === code)?.messages ?? null;
}

/** Встроенный язык по коду. */
export function builtinLanguage(code: string): BuiltinLanguage | null {
  return BUILTIN_LANGUAGES.find((language) => language.code === code) ?? null;
}

/** Строка списка языков: встроенный язык или внешний файл. */
export interface LanguageEntry {
  code: string;
  name: string;
  /** Ключ подписи встроенного языка; у внешнего файла его нет. */
  nameKey?: string;
  /** Причина, по которой файл не прочитан; `null` - словарь годен. */
  problem: AppError | null;
  /** Ключи источника, которых нет или у которых не хватает форм. */
  missing: number;
  /** Ключи файла, которых нет в источнике. */
  extra: number;
  /** Язык встроен в программу. */
  builtin: boolean;
  /** Внешний файл перекрывает встроенный язык с тем же кодом. */
  overrides: boolean;
  /** Сообщения внешнего файла; у встроенного без файла - `null`. */
  messages: Messages | null;
}

/** Документ внешнего словаря: `name` и сообщения. */
export interface DictionaryFile {
  name: string;
  messages: Messages;
}

/** Источник для сравнения: встроенный язык того же кода, иначе русский. */
export function sourceFor(code: string): Messages {
  return builtinMessages(code) ?? ruMessages;
}

/**
 * Накладывает внешний словарь на встроенный.
 *
 * Совпавший ключ с формами склонения сливается по формам: пропущенная
 * во внешнем файле форма берётся из встроенного языка, иначе число
 * показывало бы чужую форму (ADR 0057).
 */
export function mergeMessages(builtin: Messages | null, external: Messages | null): Messages {
  if (builtin === null) return { ...(external ?? {}) };
  if (external === null) return { ...builtin };

  const merged: Messages = { ...builtin };
  for (const [key, value] of Object.entries(external)) {
    const base = builtin[key];
    merged[key] =
      typeof base === "object" && typeof value === "object" ? { ...base, ...value } : value;
  }
  return merged;
}

/**
 * Переведён ли ключ.
 *
 * У строки сравнивать нечего, а у набора форм проверяется полнота по
 * категориям языка файла: английскому хватает `one` и `other`, русскому
 * нужны ещё `few` и `many`. Пропущенная категория - это пропуск, иначе
 * бейдж «переведён полностью» врал бы.
 */
function isTranslated(
  key: string,
  messages: Record<string, DictionaryMessage>,
  categories: PluralCategory[],
  source: Messages,
): boolean {
  const reference = source[key];
  const value = messages[key];

  if (value === undefined) return false;
  if (typeof reference !== "object") return true;
  if (typeof value !== "object") return false;

  return categories.every((category) => typeof value[category] === "string");
}

/** Ключи источника, которых не хватает словарю. */
export function missingKeysOf(code: string, messages: Messages): string[] {
  const source = sourceFor(code);
  const categories = pluralCategories(code);

  return Object.keys(source).filter((key) => !isTranslated(key, messages, categories, source));
}

/** Документ дополнений: недостающие ключи с текстом источника. */
export function missingDocumentFor(
  code: string,
  name: string,
  messages: Messages,
): DictionaryFile | null {
  const keys = missingKeysOf(code, messages);
  if (keys.length === 0) return null;

  const source = sourceFor(code);
  const document: Messages = {};
  for (const key of keys) document[key] = source[key];

  return { name, messages: document };
}

/** Документ для файла дополнений: только недостающие ключи. */
export function missingDocument(entry: LanguageEntry): DictionaryFile | null {
  if (entry.problem !== null || entry.messages === null) return null;
  return missingDocumentFor(entry.code, entry.name, entry.messages);
}

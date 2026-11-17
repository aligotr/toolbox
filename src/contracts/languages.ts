// Контракт словарей интерфейса (ADR 0039).
//
// Разбор JSONC делает ядро: интерфейс получает готовые сообщения и причину
// отказа. Форма сообщения описана здесь, чтобы сервис словарей и раздел
// «Язык» говорили об одном и том же файле.
//
// Категории склонения — строки, а не союз из `core`: контракты лежат ниже
// ядра и не могут его импортировать. Проверка категорий остаётся за ядром.

import type { AppError } from "./errors";

/** Формы склонения в файле словаря: `one`, `few`, `many`, `other`. */
export type DictionaryForms = Record<string, string>;

/** Сообщение словаря: строка или набор форм склонения. */
export type DictionaryMessage = string | DictionaryForms;

/** Сведения о файле словаря из `languages_list`. */
export interface LanguageSummary {
  /** Код языка: имя файла без расширения. */
  code: string;
  /** Название для списка: поле `name`, иначе код. */
  name: string;
  /** Причина, по которой файл не прочитан; `null` — словарь годен. */
  problem: AppError | null;
}

/** Прочитанный словарь из `language_load`. */
export interface LanguageDocument {
  code: string;
  name: string;
  messages: Record<string, DictionaryMessage>;
}

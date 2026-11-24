// Контракт словарей интерфейса (ADR 0039, ADR 0057).
//
// Встроенные `ru` и `en` живут в интерфейсе. Разбор JSONC делает ядро:
// интерфейс получает готовые сообщения и причину отказа.
//
// Категории склонения — строки, а не союз из `core`: контракты лежат ниже
// ядра и не могут его импортировать. Проверка категорий остаётся за ядром.

import type { AppError } from "./errors";

/** Формы склонения в файле словаря: `one`, `few`, `many`, `other`. */
export type DictionaryForms = Record<string, string>;

/** Сообщение словаря: строка или набор форм склонения. */
export type DictionaryMessage = string | DictionaryForms;

/** Сведения о внешнем словаре из `languages_catalog`. */
export interface CatalogEntry {
  /** Код языка: имя файла без расширения. */
  code: string;
  /** Название для списка: поле `name`, иначе код. */
  name: string;
  /** Причина, по которой файл не прочитан; `null` - словарь годен. */
  problem: AppError | null;
  /** Сообщения годного словаря; у битого - `null`. */
  messages: Record<string, DictionaryMessage> | null;
}

/** Прочитанный словарь из `language_load`. */
export interface LanguageDocument {
  code: string;
  name: string;
  messages: Record<string, DictionaryMessage>;
}

/** Итог записи файла изменений из `language_updates_write`. */
export interface UpdatesResult {
  /** Путь файла; `null`, если изменений нет и файл убран. */
  path: string | null;
  /** Файл создан или обновлён; ложь - уже был актуален. */
  written: boolean;
  /** Сколько строк в файле изменений; ноль, если файла нет. */
  count: number;
  /** Сколько ключей добавить. */
  added: number;
  /** Сколько ключей убрать. */
  removed: number;
}

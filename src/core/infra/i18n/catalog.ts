// Текущий каталог перевода: эталон, выбранный словарь и язык.
//
// Состояние реактивное: `t()` читает его из шаблона, поэтому смена языка
// перерисовывает интерфейс без перезапуска (ADR 0039).

import { reactive } from "vue";
import { DEFAULT_LOCALE } from "./locale.ts";
import { translate } from "./translate.ts";
import type { MessageParams, Messages } from "./types.ts";

/** Состояние каталога. */
interface CatalogState {
  locale: string;
  messages: Messages;
  fallback: Messages;
}

/** Каталог: его читает `t()` и за ним следит Vue. */
export const catalog = reactive<CatalogState>({
  locale: DEFAULT_LOCALE,
  messages: {},
  fallback: {},
});

/** Устанавливает встроенный словарь — эталон ключей. */
export function installBuiltin(messages: Messages): void {
  catalog.fallback = messages;
  if (catalog.locale === DEFAULT_LOCALE) catalog.messages = messages;
}

/** Переключает словарь; язык документа меняется вместе с ним. */
export function setCatalog(locale: string, messages: Messages): void {
  catalog.locale = locale;
  catalog.messages = messages;
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }
}

/** Текст по ключу; читает реактивное состояние, поэтому шаблон обновится. */
export function t(key: string, params?: MessageParams): string {
  return translate(catalog.messages, catalog.fallback, catalog.locale, key, params);
}

/**
 * Есть ли у ключа сообщение в выбранном или встроенном словаре.
 *
 * Нужно кодам ошибок: известный код переводится, а неизвестный показывается
 * запасным русским текстом из ядра, а не самим кодом.
 */
export function hasMessage(key: string): boolean {
  return key in catalog.messages || key in catalog.fallback;
}

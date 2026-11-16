// Текущий каталог перевода: эталон, выбранный словарь и язык.
//
// Состояние реактивное: `t()` читает его из шаблона, поэтому смена языка
// перерисовывает интерфейс без перезапуска (ADR 0039).

import { reactive } from "vue";
import { translate } from "./translate.ts";
import type { MessageParams, Messages } from "./types.ts";

/** Язык встроенного словаря: он же последний рубеж отката. */
export const DEFAULT_LOCALE = "ru";

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

// Поиск сообщения и подстановки (ADR 0039).
//
// Чистые функции без Vue: механизм проверяется обычным `node --test`.
// Цепочка отката задана вызывающим: выбранный словарь → эталонный → ключ.

import { FALLBACK_LOCALE, formatNumber, pluralCategory } from "./locale.ts";
import type { Message, MessageParams, Messages } from "./types.ts";

/** Подстановка: `{name}`. Другого синтаксиса в словаре нет. */
const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Текст по ключу.
 *
 * Ключ возвращается как есть, если сообщения нет ни в выбранном словаре,
 * ни в эталонном: пустая строка выглядела бы переводом, а не пропуском.
 */
export function translate(
  messages: Messages,
  fallback: Messages,
  locale: string,
  key: string,
  params: MessageParams = {},
): string {
  // Эталон читается по своим правилам: русская форма `many` нужна и тогда,
  // когда интерфейс переключён на язык с другой системой склонений.
  const text = pick(messages[key], locale, params) ?? pick(fallback[key], FALLBACK_LOCALE, params);

  if (text === undefined) return key;
  return interpolate(text, params, locale);
}

/** Выбирает строку сообщения: для набора форм нужна категория по `count`. */
function pick(
  message: Message | undefined,
  locale: string,
  params: MessageParams,
): string | undefined {
  if (typeof message === "string") return message;
  if (!message) return undefined;

  const count = params.count;
  if (typeof count !== "number") return message.other;

  // Формы, которой нет в файле, здесь быть не должно: `undefined` отправит
  // вызывающего к эталонному словарю, а не покажет чужую категорию.
  return message[pluralCategory(locale, count)] ?? message.other;
}

/** Подставляет `{name}`; неизвестное имя остаётся видимым. */
function interpolate(text: string, params: MessageParams, locale: string): string {
  return text.replace(PLACEHOLDER, (whole, name: string) => {
    const value = params[name];
    if (value === undefined) return whole;
    return typeof value === "number" ? formatNumber(locale, value) : value;
  });
}

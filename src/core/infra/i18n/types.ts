// Типы механизма перевода (ADR 0039).

/** Категория склонения по правилам CLDR. */
export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";

/** Значение подстановки: текст показывается как есть, число — по локали. */
export type MessageParams = Record<string, string | number>;

/** Сообщение: одна строка или формы по категориям склонения. */
export type Message = string | Partial<Record<PluralCategory, string>>;

/** Словарь: ключ → сообщение. */
export type Messages = Record<string, Message>;

// Публичный фасад механизма перевода (ADR 0039).

export { catalog, DEFAULT_LOCALE, hasMessage, installBuiltin, setCatalog, t } from "./catalog.ts";
export { formatNumber, isLocaleTag, pluralCategories, pluralCategory } from "./locale.ts";
export type { Message, MessageParams, Messages, PluralCategory } from "./types.ts";

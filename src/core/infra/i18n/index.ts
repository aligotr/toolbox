// Публичный фасад механизма перевода (ADR 0039).

export { catalog, hasMessage, installBuiltin, setCatalog, t } from "./catalog.ts";
export {
  DEFAULT_LOCALE,
  formatNumber,
  isLocaleTag,
  pluralCategories,
  pluralCategory,
} from "./locale.ts";
export type { Message, MessageParams, Messages, PluralCategory } from "./types.ts";

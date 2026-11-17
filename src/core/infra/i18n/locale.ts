// Локаль: склонения и числа по правилам платформы.
//
// `Intl` — единственная зависимость механизма. Битый тег не должен ронять
// журнал и таблицу: проверка и откат живут здесь, а не в каждом вызывающем.

import type { PluralCategory } from "./types.ts";

/** Язык эталонного словаря: на него откатываются правила. */
export const FALLBACK_LOCALE = "ru";

/** Готовые правила по локали: `Intl` дорог в создании, а `t()` зовут часто. */
const rules = new Map<string, Intl.PluralRules>();

/** Правила склонения локали; битый тег даёт русские правила. */
function pluralRules(locale: string): Intl.PluralRules {
  const cached = rules.get(locale);
  if (cached) return cached;

  let created: Intl.PluralRules;
  try {
    created = new Intl.PluralRules(locale);
  } catch {
    created = new Intl.PluralRules(FALLBACK_LOCALE);
  }

  rules.set(locale, created);
  return created;
}

/** Категория склонения для числа. */
export function pluralCategory(locale: string, count: number): PluralCategory {
  return pluralRules(locale).select(count) as PluralCategory;
}

/**
 * Категории, которые нужны языку.
 *
 * По ним проверяется полнота словаря: английский обходится `one` и `other`,
 * русскому нужны ещё `few` и `many`. Неполный набор — это пропуск, а не
 * «переведено полностью».
 */
export function pluralCategories(locale: string): PluralCategory[] {
  return pluralRules(locale).resolvedOptions().pluralCategories as PluralCategory[];
}

/** Число по правилам локали; битый тег откатывается на русский. */
export function formatNumber(
  locale: string,
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  try {
    return new Intl.NumberFormat(locale, options).format(value);
  } catch {
    return new Intl.NumberFormat(FALLBACK_LOCALE, options).format(value);
  }
}

/**
 * Годен ли код как тег локали.
 *
 * Проверка структурная: `Intl` не знает списка языков, но отвергает
 * синтаксически невозможный тег вроде `pt_BR`.
 */
export function isLocaleTag(code: string): boolean {
  try {
    Intl.getCanonicalLocales(code);
    return true;
  } catch {
    return false;
  }
}

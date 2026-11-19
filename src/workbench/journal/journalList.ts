// Список журнала: отбор, порядок, дни и поиск.
//
// Чистые помощники без состояния и Vue: экран только читает их вывод.
// Перевод берётся из самой записи (`journalSearchText`); подписи дней
// и видов живут в представлении.

import { journalSearchText, type JournalEntry } from "@/core/infra/journal";

/** Порядок записей в ленте. */
export type JournalOrder = "newest" | "oldest";

/** Условия показа: поиск, только отказы и выбранные источники. */
export interface JournalFilters {
  /** Строка поиска; пустая строка ничего не отсеивает. */
  query: string;
  /** Показывать только отказы. */
  onlyErrors: boolean;
  /** Выбранные источники; пустой список - все. */
  sources: string[];
}

/** Строка ленты: запись или заголовок дня. */
export type JournalRow = { type: "day"; dayKey: number } | { type: "entry"; entry: JournalEntry };

/** Часть текста: совпала с поиском или нет. */
export interface TextPart {
  text: string;
  match: boolean;
}

/** Полночь местного дня для момента времени. */
export function dayKeyOf(at: number): number {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Подходит ли запись условиям показа. */
export function matchesFilters(entry: JournalEntry, filters: JournalFilters): boolean {
  if (filters.onlyErrors && entry.kind !== "error") return false;
  if (filters.sources.length > 0 && !filters.sources.includes(entry.source)) return false;

  const query = filters.query.trim().toLowerCase();
  if (query === "") return true;
  return journalSearchText(entry).toLowerCase().includes(query);
}

/** Сколько записей новее метки и подходит условиям: прирост живой ленты. */
export function countNewer(
  entries: JournalEntry[],
  filters: JournalFilters,
  markId: number,
): number {
  return entries.filter((entry) => entry.id > markId && matchesFilters(entry, filters)).length;
}

/** Ставит записи в выбранном порядке. */
export function orderEntries(entries: JournalEntry[], order: JournalOrder): JournalEntry[] {
  return order === "oldest" ? [...entries].reverse() : entries;
}

/** Вставляет заголовок дня перед первой записью каждого дня. */
export function dayRows(entries: JournalEntry[]): JournalRow[] {
  const rows: JournalRow[] = [];
  let currentDay: number | null = null;

  for (const entry of entries) {
    const day = dayKeyOf(entry.at);
    if (day !== currentDay) {
      rows.push({ type: "day", dayKey: day });
      currentDay = day;
    }
    rows.push({ type: "entry", entry });
  }

  return rows;
}

/** Сколько записей пришло от каждого источника, по алфавиту. */
export function sourceCounts(entries: JournalEntry[]): { source: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.source, (counts.get(entry.source) ?? 0) + 1);
  }

  return [...counts]
    .map(([source, count]) => ({ source, count }))
    .sort((left, right) => left.source.localeCompare(right.source));
}

/**
 * Делит текст на части по запросу без учёта регистра.
 *
 * Пустой запрос возвращает текст одной частью: подсвечивать нечего.
 */
export function highlightParts(text: string, query: string): TextPart[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [{ text, match: false }];

  const parts: TextPart[] = [];
  const haystack = text.toLowerCase();
  let from = 0;

  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    if (at > from) parts.push({ text: text.slice(from, at), match: false });
    parts.push({ text: text.slice(at, at + needle.length), match: true });
    from = at + needle.length;
  }

  if (from < text.length) parts.push({ text: text.slice(from), match: false });
  return parts.length > 0 ? parts : [{ text, match: false }];
}

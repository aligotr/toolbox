// Общий журнал интерфейса.
//
// Журнал — поток фактов о работе подсистем (см. `.agents/GLOSSARY.md`).
// Отвечает на вопрос «что делала программа», в отличие от лога, который
// отвечает на вопрос «почему не сработало».
//
// Живёт вне компонентов: переключение модулей не должно стирать историю.
// Пишут его модули и ядро **явно** — шина сама в журнал ничего не кладёт.
//
// Запись хранит код словаря и данные подстановок, а не готовую фразу:
// смена языка перерисовывает всю историю (ADR 0039).

import { reactive } from "vue";
import { JOURNAL_LIMIT } from "./constants";
import { asAppError, describeError } from "./errors.ts";
import { hasMessage, t, type MessageParams } from "./i18n/index.ts";

/** Вид записи. Влияет только на оформление, не на хранение. */
export type JournalKind = "info" | "result" | "error";

/** Значения подстановок записи: данные, а не готовые строки. */
export type JournalParams = Record<string, unknown>;

/** Факт для журнала: код словаря и данные; используется и вне журнала. */
export interface JournalFact {
  code: string;
  params: JournalParams;
}

/** Одна строка журнала. */
export interface JournalEntry extends JournalFact {
  /** Порядковый номер: годится как ключ списка и не повторяется. */
  id: number;
  /** Момент записи, миллисекунды эпохи. */
  at: number;
  /** Кто записал: идентификатор модуля или `core`. */
  source: string;
  kind: JournalKind;
}

/** Состояние журнала. Новые записи сверху: свежее важнее старого. */
export const journal = reactive<{ entries: JournalEntry[] }>({ entries: [] });

let nextId = 1;

/** Добавляет запись в журнал. */
export function write(
  source: string,
  kind: JournalKind,
  code: string,
  params: JournalParams = {},
): void {
  journal.entries.unshift({
    id: nextId,
    at: Date.now(),
    source,
    kind,
    code,
    params,
  });
  nextId += 1;
  if (journal.entries.length > JOURNAL_LIMIT) {
    journal.entries.length = JOURNAL_LIMIT;
  }
}

/** Значение параметра, приведённое к тексту подстановки. */
function paramText(value: unknown): string | number {
  if (typeof value === "string" || typeof value === "number") return value;
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(paramText).join(", ");
  if (asAppError(value) !== null) return describeError(value);
  return String(value);
}

/** Данные записи в виде подстановок словаря. */
function messageParams(params: JournalParams): MessageParams {
  const result: MessageParams = {};
  for (const [name, value] of Object.entries(params)) {
    result[name] = paramText(value);
  }
  return result;
}

/** Непереведённая запись: код и данные, а не пустая строка. */
function fallbackText(entry: JournalEntry): string {
  const pairs = Object.entries(entry.params).map(([name, value]) => `${name}=${paramText(value)}`);
  return pairs.length > 0 ? `${entry.code} (${pairs.join(", ")})` : entry.code;
}

/** Текст записи на текущем языке; непереведённая запись показывает код. */
export function journalText(entry: JournalEntry): string {
  if (!hasMessage(entry.code)) return fallbackText(entry);
  return t(entry.code, messageParams(entry.params));
}

/** Подпись источника: служебное ядро переводится, модули называются как есть. */
export function journalSource(source: string): string {
  if (source === "core") return t("journal.source.core");
  return source;
}

/**
 * Текст записи для поиска: перевод, источник, код и значения параметров.
 *
 * Поиск идёт и по данным, а не только по видимой фразе: так по журналу
 * находят запись по коду или адрес, которого нет в переводе.
 */
export function journalSearchText(entry: JournalEntry): string {
  const values = Object.values(entry.params).map(paramText);
  return [
    journalText(entry),
    journalSource(entry.source),
    entry.source,
    entry.code,
    ...values,
  ].join(" ");
}

/** Полностью очищает журнал. */
export function clearJournal(): void {
  journal.entries.splice(0, journal.entries.length);
}

// Общий журнал интерфейса.
//
// Журнал — поток фактов о работе подсистем (см. `.agents/GLOSSARY.md`).
// Отвечает на вопрос «что делала программа», в отличие от лога, который
// отвечает на вопрос «почему не сработало».
//
// Живёт вне компонентов: переключение модулей не должно стирать историю.
// Пишут его модули и ядро **явно** — шина сама в журнал ничего не кладёт.

import { reactive } from "vue";

/** Вид записи. Влияет только на оформление, не на хранение. */
export type JournalKind = "info" | "result" | "error";

/** Одна строка журнала. */
export interface JournalEntry {
  /** Порядковый номер: годится как ключ списка и не повторяется. */
  id: number;
  /** Момент записи, миллисекунды эпохи. */
  at: number;
  /** Кто записал: идентификатор модуля или «ядро». */
  source: string;
  kind: JournalKind;
  /** Человеческая формулировка факта. */
  text: string;
}

/** Сколько записей держим в памяти. */
const LIMIT = 200;

/** Состояние журнала. Новые записи сверху: свежее важнее старого. */
export const journal = reactive<{ entries: JournalEntry[] }>({ entries: [] });

let nextId = 1;

/** Уже записанные «однократные» факты: их повтор ничего не добавляет. */
const onceKeys = new Set<string>();

/** Добавляет запись в журнал. */
export function write(source: string, kind: JournalKind, text: string): void {
  journal.entries.unshift({ id: nextId, at: Date.now(), source, kind, text });
  nextId += 1;
  if (journal.entries.length > LIMIT) {
    journal.entries.length = LIMIT;
  }
}

/**
 * Записывает факт один раз за запуск приложения.
 *
 * Нужно для фактов, которые относятся к приложению, а не к экрану:
 * например, «подписка на core:pong активна». Экран создаёт подписку заново
 * при каждом открытии, но сообщать об этом каждый раз — значит забивать
 * историю одной и той же строкой.
 */
export function writeOnce(
  key: string,
  source: string,
  kind: JournalKind,
  text: string,
): void {
  if (onceKeys.has(key)) return;
  onceKeys.add(key);
  write(source, kind, text);
}

/** Полностью очищает журнал. */
export function clearJournal(): void {
  journal.entries.splice(0, journal.entries.length);
}

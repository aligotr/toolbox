// Состояние запуска, общее для оболочки и модулей.
//
// Rust отвечает на вопрос «можно ли работать и что показывать». Здесь лежит
// только чтение этого ответа: тип повторяется в двух экранах, а вызывать
// команду из каждого по-своему — значит рано или поздно разойтись полям.

import { invoke } from "@tauri-apps/api/core";

/** Ответ Rust о запуске. */
export interface StartupStatus {
  /** `true` — писать некуда, модули не запущены. */
  blocked: boolean;
  /** Заголовок блокирующего экрана: причина у каждого отказа своя. */
  title: string | null;
  /** Папка программы. */
  root: string;
  /** Человеческое объяснение отказа. */
  reason: string | null;
  /** Путь к файлу лога текущих суток. */
  log_path: string;
  /** Действующий уровень лога. */
  log_level: string;
}

/**
 * Читает состояние запуска.
 *
 * `null` означает «статуса нет» — так бывает только вне Tauri, при отладке
 * одной страницы. В этом случае интерфейс считает запуск удавшимся.
 */
export async function loadStartupStatus(): Promise<StartupStatus | null> {
  try {
    return await invoke<StartupStatus>("startup_status");
  } catch {
    return null;
  }
}

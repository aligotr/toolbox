// Контракт файла `local/settings.json` (ADR 0010, ADR 0012).
//
// Схема версионирована и допускает чужие ключи: файл правят руками и могут
// принести с машины с более новой версией программы. Поэтому у каждого
// раздела есть индексная подпись — интерфейс читает известные поля,
// а остальное не теряет при частичной записи (запись делает ядро).

/** Порог файлового лога. */
export type LogLevel = "error" | "warn" | "info" | "debug";

/** Раздел `log`. */
export interface LogSettings {
  level: LogLevel;
  [key: string]: unknown;
}

/** Раздел `window`: логический размер и физическое положение (ADR 0014). */
export interface WindowSettings {
  width: number;
  height: number;
  /** `null` — окно ещё не двигали, положение выбирает система. */
  x: number | null;
  y: number | null;
  maximized: boolean;
  [key: string]: unknown;
}

/** Раздел `ui`: состояние интерфейса, переживающее перезапуск. */
export interface UiSettings {
  sidebar_collapsed: boolean;
  /** Язык интерфейса; `null` — «как в системе» (ADR 0039). */
  language: string | null;
  [key: string]: unknown;
}

/** Настройки целиком. */
export interface Settings {
  version: number;
  log: LogSettings;
  window: WindowSettings;
  ui: UiSettings;
  /** Идентификатор активного профиля: папка `profiles/<id>/`. */
  active_profile: string;
  [key: string]: unknown;
}

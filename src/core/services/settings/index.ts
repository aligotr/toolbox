// Настройки приложения для интерфейса: чтение, частичная запись и сброс окна.
//
// Один источник состояния на все разделы центра управления. Каждая запись
// присылает ядру только свой раздел (`settings_set`): две панели, сохраняющие
// одновременно, иначе затирали бы правки друг друга.
//
// Событие `core:settings:changed` перечитывает файл: геометрию окна меняет
// ядро, когда пользователь двигает и растягивает рамку. Без перечитывания
// раздел «Окно» показывал бы размер на момент открытия вкладки.

import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { computed, reactive } from "vue";
import type { LogLevel, Settings } from "@/contracts/settings";
import { subscribeEvent } from "../../infra/bus";
import { JOURNAL_CORE_SOURCE } from "../../infra/constants";
import { activateLanguage } from "../languages";
import { SETTINGS_CHANGED_TOPIC } from "./constants";
import { describeError } from "../../infra/errors";
import { write } from "../../infra/journal";
import { idle, type OperationStatus } from "../../infra/status";

/** Операции настроек: у каждой своя загрузка и своя ошибка. */
export type SettingsOperation = "load" | "log" | "ui" | "window";

/** Состояние файла настроек. */
export interface SettingsState {
  current: Settings | null;
  /** Прочитан ли файл хотя бы раз. */
  loaded: boolean;
}

/** Общее состояние настроек. */
export const settings = reactive<SettingsState>({
  current: null,
  loaded: false,
});

/** Состояния операций: `status.log.loading`, `status.window.error` и т. д. */
export const status = reactive<Record<SettingsOperation, OperationStatus>>({
  load: idle(),
  log: idle(),
  ui: idle(),
  window: idle(),
});

/** Действующий уровень лога; до чтения файла — умолчание ядра, `error`. */
export const logLevel = computed<LogLevel>(() => settings.current?.log.level ?? "error");

/**
 * Перечитывает настройки.
 *
 * Ошибка не стирает уже показанные значения: файл мог быть занят на сетевой
 * шаре, и пустые поля выглядели бы сбросом настроек.
 */
export async function loadSettings(): Promise<void> {
  if (status.load.loading) return;

  status.load.loading = true;
  status.load.error = null;
  try {
    settings.current = await invoke<Settings>("settings_get");
    settings.loaded = true;
  } catch (error) {
    status.load.error = describeError(error);
    write(JOURNAL_CORE_SOURCE, "error", "journal.settings.readError", {
      reason: error,
    });
  } finally {
    status.load.loading = false;
  }
}

/**
 * Записывает один раздел и применяет ответ целиком.
 *
 * Ответ ядра — настройки после слияния: неизвестные ключи и чужие разделы
 * уже учтены, поэтому интерфейс не собирает состояние по частям.
 */
async function saveSection(
  operation: Exclude<SettingsOperation, "load">,
  section: string,
  value: unknown,
): Promise<Settings | null> {
  if (status[operation].loading) return null;

  status[operation].loading = true;
  status[operation].error = null;
  try {
    const next = await invoke<Settings>("settings_set", { section, value });
    settings.current = next;
    settings.loaded = true;
    return next;
  } catch (error) {
    status[operation].error = describeError(error);
    write(JOURNAL_CORE_SOURCE, "error", "journal.settings.saveError", {
      section,
      reason: error,
    });
    return null;
  } finally {
    status[operation].loading = false;
  }
}

/** Меняет уровень файлового лога; действует без перезапуска. */
export async function setLogLevel(level: LogLevel): Promise<boolean> {
  const next = await saveSection("log", "log", { level });
  if (!next) return false;

  write(JOURNAL_CORE_SOURCE, "result", "journal.settings.logLevel", {
    level: next.log.level,
  });
  return true;
}

/**
 * Запоминает свёрнутость сайдбара.
 *
 * Отказ не показывается в интерфейсе: сайдбар уже переключился, и сообщение
 * об ошибке под кнопкой выглядело бы поломкой самой кнопки. Причина уходит
 * в журнал.
 */
export async function setSidebarCollapsed(collapsed: boolean): Promise<void> {
  await saveSection("ui", "ui", { sidebar_collapsed: collapsed });
}

/**
 * Меняет язык интерфейса.
 *
 * Выбор сохраняется даже при битом файле: раздел «Язык» покажет
 * предупреждение, а интерфейс откатится на русский. Сбросить выбор
 * в «как в системе» отсюда нельзя — это делает только первый запуск.
 */
export async function setLanguage(language: string | null): Promise<boolean> {
  const next = await saveSection("ui", "ui", { language });
  if (!next) return false;

  const applied = await activateLanguage(next.ui.language);
  write(JOURNAL_CORE_SOURCE, "result", "journal.settings.language", {
    language: applied,
  });
  return true;
}

/**
 * Выполняет команду окна и применяет ответ ядра.
 *
 * Сброс и перенос меняют одну геометрию одного окна, поэтому у них общая
 * загрузка и общая ошибка: две такие операции одновременно не имеют смысла.
 */
async function runWindowCommand(
  command: string,
  args: Record<string, unknown> = {},
): Promise<Settings | null> {
  if (status.window.loading) return null;

  status.window.loading = true;
  status.window.error = null;
  try {
    const next = await invoke<Settings>(command, args);
    settings.current = next;
    settings.loaded = true;
    return next;
  } catch (error) {
    status.window.error = describeError(error);
    return null;
  } finally {
    status.window.loading = false;
  }
}

/** Сбрасывает размер и положение окна; ядро применяет сброс сразу. */
export async function resetWindow(): Promise<boolean> {
  const next = await runWindowCommand("window_reset");
  if (!next) {
    write(JOURNAL_CORE_SOURCE, "error", "journal.settings.windowResetError", {
      reason: status.window.error,
    });
    return false;
  }

  write(JOURNAL_CORE_SOURCE, "result", "journal.settings.windowReset");
  return true;
}

/**
 * Переносит окно в заданную точку экрана.
 *
 * Ядро прижимает недостижимую точку к рабочей области ближайшего монитора,
 * поэтому в журнал идут фактические координаты, а не введённые.
 */
export async function moveWindow(x: number, y: number): Promise<boolean> {
  const next = await runWindowCommand("window_move", { x, y });
  if (!next) {
    write(JOURNAL_CORE_SOURCE, "error", "journal.settings.windowMoveError", {
      reason: status.window.error,
    });
    return false;
  }

  write(JOURNAL_CORE_SOURCE, "result", "journal.settings.windowMoved", {
    x: next.window.x ?? x,
    y: next.window.y ?? y,
  });
  return true;
}

/**
 * Меняет размер окна.
 *
 * Ядро не даёт окну стать больше рабочей области монитора и подтягивает
 * положение, поэтому в журнал идут фактические числа, а не введённые.
 */
export async function resizeWindow(width: number, height: number): Promise<boolean> {
  const next = await runWindowCommand("window_resize", { width, height });
  if (!next) {
    write(JOURNAL_CORE_SOURCE, "error", "journal.settings.windowResizeError", {
      reason: status.window.error,
    });
    return false;
  }

  write(JOURNAL_CORE_SOURCE, "result", "journal.settings.windowResized", {
    width: next.window.width,
    height: next.window.height,
  });
  return true;
}

/**
 * Подписка на изменение настроек ядром.
 *
 * Тема общая для всех разделов, а нагрузка содержит только имя раздела:
 * значение всё равно читается из файла, поэтому интерфейс не собирает
 * вторую копию схемы в событии.
 */
export async function startSettingsSync(): Promise<UnlistenFn> {
  return subscribeEvent<{ section: string }>(SETTINGS_CHANGED_TOPIC, () => {
    void loadSettings();
  });
}

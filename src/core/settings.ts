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
import type { LogLevel, Settings } from "../contracts/settings";
import { subscribeEvent } from "./bus";
import { JOURNAL_CORE_SOURCE, SETTINGS_CHANGED_TOPIC } from "./constants";
import { describeError } from "./errors";
import { write } from "./journal";
import { idle, type OperationStatus } from "./status";

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

/** Действующий уровень лога; до чтения файла — `info`. */
export const logLevel = computed<LogLevel>(() => settings.current?.log.level ?? "info");

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
    write(
      JOURNAL_CORE_SOURCE,
      "error",
      `настройки не прочитаны: ${status.load.error}`,
    );
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
    write(
      JOURNAL_CORE_SOURCE,
      "error",
      `настройки не сохранены (${section}): ${status[operation].error}`,
    );
    return null;
  } finally {
    status[operation].loading = false;
  }
}

/** Меняет уровень файлового лога; действует без перезапуска. */
export async function setLogLevel(level: LogLevel): Promise<boolean> {
  const next = await saveSection("log", "log", { level });
  if (!next) return false;

  write(JOURNAL_CORE_SOURCE, "result", `уровень лога: ${next.log.level}`);
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

/** Сбрасывает размер и положение окна; ядро применяет сброс сразу. */
export async function resetWindow(): Promise<boolean> {
  if (status.window.loading) return false;

  status.window.loading = true;
  status.window.error = null;
  try {
    settings.current = await invoke<Settings>("window_reset");
    settings.loaded = true;
    write(JOURNAL_CORE_SOURCE, "result", "размер и положение окна сброшены");
    return true;
  } catch (error) {
    status.window.error = describeError(error);
    write(
      JOURNAL_CORE_SOURCE,
      "error",
      `геометрия окна не сброшена: ${status.window.error}`,
    );
    return false;
  } finally {
    status.window.loading = false;
  }
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

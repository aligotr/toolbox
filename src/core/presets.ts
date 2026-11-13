// Пресеты настроек инструментов: список, сохранение, переименование, копия
// и удаление.
//
// Общий механизм для всех инструментов (ADR 0028). Ядро хранит только конверт
// — идентификатор, название, время и непроверенные настройки, — а что означает
// `payload`, знает инструмент. Поэтому здесь нет ни одного правила конкретного
// инструмента.
//
// Состояние создаётся на инструмент: `createPresets(tool)`. Два инструмента
// не делят список и статусы операций, даже если оба открыты одновременно.

import { invoke } from "@tauri-apps/api/core";
import { reactive } from "vue";
import type {
  Preset,
  StoredPreset,
  StoredPresetDefault,
  StoredPresetList,
} from "../contracts/presets";
import { JOURNAL_CORE_SOURCE } from "./constants";
import { describeError } from "./errors";
import { write } from "./journal";
import { idle, type OperationStatus } from "./status";

/** Операции над пресетами: отказ удаления не блокирует сохранение. */
export type PresetOperation =
  | "list"
  | "create"
  | "update"
  | "rename"
  | "duplicate"
  | "delete"
  | "default";

/** Список пресетов одного инструмента. */
export interface PresetState {
  items: Preset[];
  /** Прочитан ли список хотя бы раз. */
  loaded: boolean;
  /** Пресет, который грузится в новую вкладку; `null` — умолчания нет. */
  defaultId: string | null;
}

/** Состояния операций: `status.create.loading`, `status.delete.error` и т. д. */
export type PresetStatus = Record<PresetOperation, OperationStatus>;

/** Работа с пресетами одного инструмента. */
export interface Presets {
  state: PresetState;
  status: PresetStatus;
  /** Перечитывает список. */
  load(): Promise<void>;
  /** Сохраняет настройки новым пресетом. */
  create(title: string, payload: unknown): Promise<Preset | null>;
  /** Заменяет настройки пресета, не меняя название. */
  update(id: string, payload: unknown): Promise<Preset | null>;
  /** Переименовывает пресет: файл остаётся на месте. */
  rename(id: string, title: string): Promise<Preset | null>;
  /** Дублирует пресет с припиской «(копия)». */
  duplicate(id: string): Promise<Preset | null>;
  /** Удаляет пресет в корзину. */
  remove(preset: Preset): Promise<boolean>;
  /** Назначает или снимает пресет по умолчанию. */
  setDefault(id: string | null): Promise<boolean>;
}

/**
 * Названия пресетов по умолчанию по инструментам.
 *
 * Оболочке нужно только название: «Перезапустить вкладку» подсказывает,
 * какой пресет загрузится, но не лезет в состояние инструмента. Пока список
 * не прочитан, названия нет — подсказка просто не упоминает пресет.
 */
const defaultTitles = new Map<string, string>();

/** Название пресета по умолчанию для инструмента; `null` — не задан. */
export function defaultPresetTitle(tool: string): string | null {
  return defaultTitles.get(tool) ?? null;
}

/**
 * Созданные состояния пресетов по инструментам.
 *
 * Оболочке нужно название пресета по умолчанию, а оно известно только после
 * чтения списка. Реестр позволяет прочитать списки не зная, какие инструменты
 * существуют: модуль сам сообщает о себе при создании состояния.
 */
const byTool = new Map<string, Presets>();

/**
 * Читает списки пресетов всех созданных инструментов.
 *
 * Отказ не мешает работе: подсказка просто не упомянет пресет, а загрузка
 * при открытии вкладки напишет причину в журнал.
 */
export async function loadPresetDefaults(): Promise<void> {
  await Promise.all([...byTool.values()].map((presets) => presets.load()));
}

/** Переносит документ ядра в форму интерфейса. */
function toPreset(stored: StoredPreset): Preset {
  return {
    id: stored.id,
    title: stored.title,
    savedAt: stored.saved_at,
    payload: stored.payload,
  };
}

/** Создаёт независимое состояние пресетов инструмента. */
export function createPresets(tool: string): Presets {
  const state = reactive<PresetState>({ items: [], loaded: false, defaultId: null });
  const status = reactive<PresetStatus>({
    list: idle(),
    create: idle(),
    update: idle(),
    rename: idle(),
    duplicate: idle(),
    delete: idle(),
    default: idle(),
  });

  /** Перечитывает список пресетов инструмента и указатель по умолчанию. */
  async function reload(): Promise<void> {
    const [list, presetDefault] = await Promise.all([
      invoke<StoredPresetList>("presets_list", { tool }),
      invoke<StoredPresetDefault>("preset_default_get", { tool }),
    ]);

    // Испорченный файл не мешает остальным, но причину пользователь должен
    // видеть: иначе пресет просто исчез бы из списка.
    for (const warning of list.warnings) {
      write(JOURNAL_CORE_SOURCE, "error", warning);
    }
    if (presetDefault.warning !== null) {
      write(JOURNAL_CORE_SOURCE, "error", presetDefault.warning);
    }

    state.items = list.items.map(toPreset);
    state.defaultId = presetDefault.id;
    state.loaded = true;

    const preset = presetDefault.id === null
      ? undefined
      : state.items.find((item) => item.id === presetDefault.id);
    if (preset) defaultTitles.set(tool, preset.title);
    else defaultTitles.delete(tool);
  }

  /**
   * Читает пресеты для интерфейса.
   *
   * Ошибка не стирает уже показанный список: пресет мог быть добавлен
   * на другой машине, и пустой список выглядел бы потерей настроек.
   * Повторный вызов во время чтения дожидается того же результата: автозагрузка
   * пресета не должна принять незаполненное состояние за «умолчания нет».
   */
  let listing: Promise<void> | null = null;

  async function load(): Promise<void> {
    if (listing) return listing;

    status.list.loading = true;
    status.list.error = null;
    listing = reload()
      .catch((error: unknown) => {
        status.list.error = describeError(error);
        write(
          JOURNAL_CORE_SOURCE,
          "error",
          `пресеты «${tool}» не прочитаны: ${status.list.error}`,
        );
      })
      .finally(() => {
        status.list.loading = false;
        listing = null;
      });

    return listing;
  }

  /**
   * Выполняет операцию над пресетом: занятость, ошибка, журнал и перечитывание.
   *
   * `journal` получает результат и возвращает запись об успехе. Загрузка
   * списка сюда не входит: у неё нет результата и сообщения об успехе.
   */
  async function perform<T>(
    operation: OperationStatus,
    failure: string,
    action: () => Promise<T>,
    journal: (value: T) => string,
  ): Promise<T | null> {
    if (operation.loading) return null;

    operation.loading = true;
    operation.error = null;
    try {
      const value = await action();
      write(JOURNAL_CORE_SOURCE, "result", journal(value));
      await reload();
      return value;
    } catch (error) {
      operation.error = describeError(error);
      write(
        JOURNAL_CORE_SOURCE,
        "error",
        `${failure}: ${operation.error}`,
      );
      return null;
    } finally {
      operation.loading = false;
    }
  }

  /** Сохраняет настройки новым пресетом. `null` — сохранить не удалось. */
  async function create(title: string, payload: unknown): Promise<Preset | null> {
    const created = await perform(
      status.create,
      "пресет не сохранён",
      () => invoke<StoredPreset>("preset_create", { tool, title, payload }),
      (value) => `сохранён пресет «${value.title}» (${value.id})`,
    );
    return created ? toPreset(created) : null;
  }

  /**
   * Заменяет настройки пресета.
   *
   * Название и незнакомые ключи файла остаются прежними: сохранение — это
   * снимок настроек, а не переименование.
   */
  async function update(id: string, payload: unknown): Promise<Preset | null> {
    const updated = await perform(
      status.update,
      "пресет не обновлён",
      () => invoke<StoredPreset>("preset_update", { tool, id, payload }),
      (value) => `пресет «${value.title}» обновлён`,
    );
    return updated ? toPreset(updated) : null;
  }

  /** Переименовывает пресет: файл остаётся на месте. */
  async function rename(id: string, title: string): Promise<Preset | null> {
    const renamed = await perform(
      status.rename,
      "пресет не переименован",
      () => invoke<StoredPreset>("preset_rename", { tool, id, title }),
      (value) => `пресет «${id}» переименован в «${value.title}»`,
    );
    return renamed ? toPreset(renamed) : null;
  }

  /** Дублирует пресет: копия получает приписку «(копия)». */
  async function duplicate(id: string): Promise<Preset | null> {
    const copy = await perform(
      status.duplicate,
      "пресет не скопирован",
      () => invoke<StoredPreset>("preset_duplicate", { tool, id }),
      (value) => `пресет «${id}» скопирован как «${value.title}»`,
    );
    return copy ? toPreset(copy) : null;
  }

  /** Удаляет пресет в `local/trash/presets/<tool>/`. */
  async function remove(preset: Preset): Promise<boolean> {
    const target = await perform(
      status.delete,
      "пресет не удалён",
      () => invoke<string>("preset_delete", { tool, id: preset.id }),
      (value) => `пресет «${preset.title}» перемещён в «${value}»`,
    );
    return target !== null;
  }

  /**
   * Назначает пресет по умолчанию или снимает указатель.
   *
   * `null` — новая вкладка инструмента снова открывается пустой. Работает
   * только на новые вкладки: открытые сеансы настройка не трогает.
   */
  async function setDefault(id: string | null): Promise<boolean> {
    const result = await perform<{ id: string | null }>(
      status.default,
      "пресет по умолчанию не изменён",
      async () => ({
        id: await invoke<string | null>("preset_default_set", { tool, id }),
      }),
      (value) => {
        if (value.id === null) {
          return `пресет по умолчанию для «${tool}» снят`;
        }
        const title =
          state.items.find((item) => item.id === value.id)?.title ?? value.id;
        return `пресет «${title}» выбран по умолчанию для «${tool}»`;
      },
    );
    return result !== null;
  }

  const presets: Presets = {
    state,
    status,
    load,
    create,
    update,
    rename,
    duplicate,
    remove,
    setDefault,
  };
  byTool.set(tool, presets);
  return presets;
}

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
  | "delete";

/** Список пресетов одного инструмента. */
export interface PresetState {
  items: Preset[];
  /** Прочитан ли список хотя бы раз. */
  loaded: boolean;
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
  const state = reactive<PresetState>({ items: [], loaded: false });
  const status = reactive<PresetStatus>({
    list: idle(),
    create: idle(),
    update: idle(),
    rename: idle(),
    duplicate: idle(),
    delete: idle(),
  });

  /** Перечитывает список пресетов инструмента. */
  async function reload(): Promise<void> {
    const list = await invoke<StoredPresetList>("presets_list", { tool });

    // Испорченный файл не мешает остальным, но причину пользователь должен
    // видеть: иначе пресет просто исчез бы из списка.
    for (const warning of list.warnings) {
      write(JOURNAL_CORE_SOURCE, "error", warning);
    }

    state.items = list.items.map(toPreset);
    state.loaded = true;
  }

  /**
   * Читает пресеты для интерфейса.
   *
   * Ошибка не стирает уже показанный список: пресет мог быть добавлен
   * на другой машине, и пустой список выглядел бы потерей настроек.
   */
  async function load(): Promise<void> {
    if (status.list.loading) return;

    status.list.loading = true;
    status.list.error = null;
    try {
      await reload();
    } catch (error) {
      status.list.error = describeError(error);
      write(
        JOURNAL_CORE_SOURCE,
        "error",
        `пресеты «${tool}» не прочитаны: ${status.list.error}`,
      );
    } finally {
      status.list.loading = false;
    }
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

  return { state, status, load, create, update, rename, duplicate, remove };
}

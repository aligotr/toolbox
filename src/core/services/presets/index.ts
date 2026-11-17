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
// Загрузку, ошибку и защиту от повторного запуска ведёт `useAsyncAction`;
// журнал и перечитывание списка остаются здесь — обёртка не знает домена.

import { invoke } from "@tauri-apps/api/core";
import { reactive } from "vue";
import type {
  StoredPreset,
  StoredPresetDefault,
  StoredPresetList,
} from "@/contracts/presets";
import { t } from "@/core/infra/i18n";
import { JOURNAL_CORE_SOURCE } from "../../infra/constants";
import { write, type JournalFact, type JournalParams } from "../../infra/journal";
import type { OperationStatus } from "../../infra/status";
import { useAsyncAction, type AsyncAction } from "../../infra/useAsyncAction";

/** Пресет после переноса полей в форму интерфейса. */
export interface Preset {
  id: string;
  title: string;
  /** Время сохранения в ISO-8601 UTC. */
  savedAt: string;
  /** Настройки инструмента: разбирает инструмент, не ядро. */
  payload: unknown;
}

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

  /** Перечитывает список пресетов инструмента и указатель по умолчанию. */
  async function reload(): Promise<void> {
    const [list, presetDefault] = await Promise.all([
      invoke<StoredPresetList>("presets_list", { tool }),
      invoke<StoredPresetDefault>("preset_default_get", { tool }),
    ]);

    // Испорченный файл не мешает остальным, но причину пользователь должен
    // видеть: иначе пресет просто исчез бы из списка.
    for (const warning of list.warnings) {
      write(JOURNAL_CORE_SOURCE, "error", "journal.presets.broken", {
        tool,
        reason: warning,
      });
    }
    if (presetDefault.warning !== null) {
      write(JOURNAL_CORE_SOURCE, "error", "journal.presets.defaultBroken", {
        tool,
        reason: presetDefault.warning,
      });
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

  /** Выполнение с записью причины отказа: обёртка переводит её в статус. */
  async function attempt<T>(
    failure: string,
    params: JournalParams,
    action: () => Promise<T>,
  ): Promise<T> {
    try {
      return await action();
    } catch (error) {
      write(JOURNAL_CORE_SOURCE, "error", failure, { ...params, reason: error });
      throw error;
    }
  }

  /**
   * Операция пресета: обёртка, журнал успеха и перечитывание списка.
   *
   * Журнал получает результат и аргументы: переименование и копия называют
   * и прежний, и новый идентификатор.
   */
  function presetAction<TArgs extends unknown[], TResult>(
    failure: string,
    act: (...args: TArgs) => Promise<TResult>,
    journal: (value: TResult, ...args: TArgs) => JournalFact,
  ): AsyncAction<TArgs, TResult> {
    return useAsyncAction((...args: TArgs) =>
      attempt(failure, { tool }, async () => {
        const value = await act(...args);
        const fact = journal(value, ...args);
        write(JOURNAL_CORE_SOURCE, "result", fact.code, fact.params);
        await reload();
        return value;
      }),
    );
  }

  /**
   * Чтение списка. Повторный вызов во время чтения дожидается того же
   * результата: автозагрузка пресета не должна принять незаполненное
   * состояние за «умолчания нет».
   */
  const listAction = useAsyncAction(() =>
    attempt("journal.presets.readError", { tool }, reload),
  );

  const createAction = presetAction(
    "journal.presets.createError",
    async (title: string, payload: unknown) =>
      toPreset(await invoke<StoredPreset>("preset_create", { tool, title, payload })),
    (preset) => ({
      code: "journal.presets.created",
      params: { tool, title: preset.title, id: preset.id },
    }),
  );

  const updateAction = presetAction(
    "journal.presets.updateError",
    async (id: string, payload: unknown) =>
      toPreset(await invoke<StoredPreset>("preset_update", { tool, id, payload })),
    (preset) => ({
      code: "journal.presets.updated",
      params: { tool, title: preset.title },
    }),
  );

  const renameAction = presetAction(
    "journal.presets.renameError",
    async (id: string, title: string) =>
      toPreset(await invoke<StoredPreset>("preset_rename", { tool, id, title })),
    (preset, id) => ({
      code: "journal.presets.renamed",
      params: { tool, id, title: preset.title },
    }),
  );

  const duplicateAction = presetAction(
    "journal.presets.duplicateError",
    async (id: string) =>
      toPreset(
        await invoke<StoredPreset>("preset_duplicate", {
          tool,
          id,
          suffix: t("presets.copySuffix"),
        }),
      ),
    (preset, id) => ({
      code: "journal.presets.duplicated",
      params: { tool, id, title: preset.title },
    }),
  );

  const deleteAction = presetAction(
    "journal.presets.deleteError",
    (preset: Preset) => invoke<string>("preset_delete", { tool, id: preset.id }),
    (target, preset) => ({
      code: "journal.presets.moved",
      params: { tool, title: preset.title, target },
    }),
  );

  const defaultAction = presetAction(
    "journal.presets.defaultError",
    async (id: string | null) => ({
      id: await invoke<string | null>("preset_default_set", { tool, id }),
    }),
    (value) => {
      if (value.id === null) {
        return {
          code: "journal.presets.defaultCleared",
          params: { tool },
        };
      }
      const title = state.items.find((item) => item.id === value.id)?.title ?? value.id;
      return {
        code: "journal.presets.defaultSet",
        params: { tool, title },
      };
    },
  );

  const status: PresetStatus = {
    list: listAction.status,
    create: createAction.status,
    update: updateAction.status,
    rename: renameAction.status,
    duplicate: duplicateAction.status,
    delete: deleteAction.status,
    default: defaultAction.status,
  };

  let listing: Promise<void> | null = null;

  /** Перечитывает список для интерфейса; отказ остаётся в `status.list`. */
  async function load(): Promise<void> {
    if (listing) return listing;

    listing = listAction
      .run()
      .then(() => undefined)
      .finally(() => {
        listing = null;
      });
    return listing;
  }

  /** Сохраняет настройки новым пресетом. `null` — сохранить не удалось. */
  function create(title: string, payload: unknown): Promise<Preset | null> {
    return createAction.run(title, payload);
  }

  /**
   * Заменяет настройки пресета.
   *
   * Название и незнакомые ключи файла остаются прежними: сохранение — это
   * снимок настроек, а не переименование.
   */
  function update(id: string, payload: unknown): Promise<Preset | null> {
    return updateAction.run(id, payload);
  }

  /** Переименовывает пресет: файл остаётся на месте. */
  function rename(id: string, title: string): Promise<Preset | null> {
    return renameAction.run(id, title);
  }

  /** Дублирует пресет: копия получает приписку «(копия)». */
  function duplicate(id: string): Promise<Preset | null> {
    return duplicateAction.run(id);
  }

  /** Удаляет пресет в `local/trash/presets/<tool>/`. */
  async function remove(preset: Preset): Promise<boolean> {
    return (await deleteAction.run(preset)) !== null;
  }

  /**
   * Назначает пресет по умолчанию или снимает указатель.
   *
   * `null` — новая вкладка инструмента снова открывается пустой. Работает
   * только на новые вкладки: открытые сеансы настройка не трогает.
   */
  async function setDefault(id: string | null): Promise<boolean> {
    return (await defaultAction.run(id)) !== null;
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

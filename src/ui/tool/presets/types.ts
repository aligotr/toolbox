// Общие типы интерфейса пресетов.
//
// Диалог и панель не знают домена инструмента: он приносит источник операций
// и ключи подписей. Так разметка и сценарий живут один раз, а формат payload,
// применение и тексты остаются у инструмента (ADR 0028, ADR 0072).

import type { Preset, PresetApplyResult, Presets } from "@/core/services/presets";

/** Итог отката: причина отказа или готовая заметка об успехе. */
export interface PresetRevertOutcome {
  /** Откат не выполнен: сеанс не тронут. */
  error: string | null;
  /** Что показать после успешного отката. */
  message: string;
}

/** Операции и состояние сеанса, нужные диалогу пресетов. */
export interface PresetDialogSource {
  /** Список и операции над файлами. */
  presets: Presets;
  /** Сеанс привязан к пресету. */
  readonly bound: boolean;
  readonly presetTitle: string | null;
  /** Настройки разошлись с сохранённым пресетом. */
  readonly changed: boolean;
  /** В сеансе есть работа, которую заменит загрузка. */
  readonly occupied: boolean;
  /** Идёт проверка: подтверждение объясняет её остановку. */
  readonly running: boolean;
  /** Загружает пресет в сеанс. */
  load(preset: Preset): Promise<PresetApplyResult>;
  /** Снимает пресет и очищает настройки сеанса до умолчаний. */
  startNew(): Promise<void>;
  /** Отменяет правки по снимку открытого пресета. */
  revert(): Promise<PresetRevertOutcome>;
  /** Сохраняет настройки в открытый пресет. */
  save(): Promise<Preset | null>;
  /** Создаёт пресет из текущих настроек. */
  create(title: string): Promise<Preset | null>;
  /** Обновляет название привязки после переименования. */
  adoptTitle(preset: Preset): void;
  /** Снимает привязку после удаления открытого пресета. */
  releaseDeleted(presetId: string): void;
}

/** Подписи подтверждения без доменных замен строк и целей. */
export type PresetConfirmTexts = Omit<
  PresetDialogTexts["confirm"],
  "replaceMessage" | "replaceRunningMessage"
>;

/** Общие подписи диалога: доменные подтверждения добавляет инструмент. */
export interface PresetDialogBaseTexts extends Omit<PresetDialogTexts, "confirm"> {
  confirm: PresetConfirmTexts;
}

/** Подписи панели пресета: ключи словаря инструмента. */
export interface PresetBarTexts {
  buttonEmpty: string;
  changed: string;
  revertHint: string;
  saveHint: string;
  notSaved: string;
  revertFailed: string;
}

/** Подписи диалога пресетов: ключи словаря инструмента. */
export interface PresetDialogTexts {
  dialogTitle: string;
  close: string;
  current: {
    changed: string;
    none: string;
    noneHint: string;
    revertHint: string;
    saveChanges: string;
  };
  list: {
    loading: string;
    empty: string;
  };
  row: {
    unknownSavedAt: string;
    renameAria: string;
    renameSave: string;
    renameCancel: string;
    loadAria: string;
    loadTip: string;
    loadTipAria: string;
    renameTip: string;
    renameTipAria: string;
    duplicateTip: string;
    duplicateAria: string;
    deleteTip: string;
    deleteAria: string;
    makeDefault: string;
    clearDefault: string;
  };
  create: {
    newTitle: string;
    saveAs: string;
    /** Кнопка «Пустой пресет»: очищает настройки и закрывает диалог. */
    startNew: string;
  };
  confirm: {
    loadAccept: string;
    deleteAccept: string;
    cancel: string;
    deleteMessage: string;
    replaceMessage: string;
    replaceRunningMessage: string;
    startNewAccept: string;
    startNewMessage: string;
  };
  notes: {
    defaultError: string;
    defaultCleared: string;
    defaultSet: string;
    loadError: string;
    loaded: string;
    loadedWarnings: string;
    saved: string;
    notSaved: string;
    revertFailed: string;
    startNewFailed: string;
    created: string;
    notCreated: string;
    renamed: string;
    notRenamed: string;
    copied: string;
    notCopied: string;
    removed: string;
    notRemoved: string;
  };
}

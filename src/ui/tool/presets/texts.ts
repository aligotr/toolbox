// Общие подписи панели и диалога пресетов (ADR 0072).
//
// Одинаковые у всех инструментов тексты живут здесь: ключи `presets.*`
// и универсальные действия `common.*`. Доменные замены строк и целей
// инструмент добавляет сам.

import type { PresetBarTexts, PresetDialogBaseTexts } from "./types";

export const PRESET_BAR_TEXTS: PresetBarTexts = {
  buttonEmpty: "presets.buttonEmpty",
  changed: "presets.changed",
  revertHint: "presets.revertHint",
  saveHint: "presets.saveHint",
  notSaved: "presets.notSaved",
  revertFailed: "presets.revertFailed",
};

export const PRESET_DIALOG_TEXTS: PresetDialogBaseTexts = {
  dialogTitle: "presets.dialogTitle",
  close: "common.close",
  current: {
    changed: "presets.currentChanged",
    none: "presets.none",
    noneHint: "presets.noneHint",
    revertHint: "presets.revertHint",
    saveChanges: "common.save",
  },
  list: {
    loading: "presets.listLoading",
    empty: "presets.listEmpty",
  },
  row: {
    unknownSavedAt: "presets.unknownSavedAt",
    renameAria: "presets.renameAria",
    renameSave: "common.renameSave",
    renameCancel: "common.renameCancel",
    loadAria: "presets.loadAria",
    loadTip: "common.load",
    loadTipAria: "presets.loadTipAria",
    renameTip: "common.rename",
    renameTipAria: "presets.renameTipAria",
    duplicateTip: "presets.duplicateTip",
    duplicateAria: "presets.duplicateAria",
    deleteTip: "common.delete",
    deleteAria: "presets.deleteAria",
    makeDefault: "presets.makeDefault",
    clearDefault: "presets.clearDefault",
  },
  create: {
    newTitle: "presets.newTitle",
    saveAs: "presets.saveAs",
    startNew: "presets.startNew",
  },
  confirm: {
    loadAccept: "common.load",
    deleteAccept: "common.delete",
    cancel: "common.cancel",
    deleteMessage: "presets.deleteMessage",
    startNewAccept: "common.create",
    startNewMessage: "presets.startNewMessage",
  },
  notes: {
    defaultError: "presets.defaultError",
    defaultCleared: "presets.defaultCleared",
    defaultSet: "presets.defaultSet",
    loadError: "presets.loadError",
    loaded: "presets.loaded",
    loadedWarnings: "presets.loadedWarnings",
    saved: "presets.saved",
    notSaved: "presets.notSaved",
    revertFailed: "presets.revertFailed",
    startNewFailed: "presets.startNewFailed",
    created: "presets.created",
    notCreated: "presets.notSaved",
    renamed: "presets.renamed",
    notRenamed: "presets.notRenamed",
    copied: "presets.copied",
    notCopied: "presets.notCopied",
    removed: "presets.removed",
    notRemoved: "presets.notRemoved",
  },
};

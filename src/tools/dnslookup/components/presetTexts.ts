// Ключи видимых текстов пресетов DNS.
//
// Общие компоненты пресетов берут подписи данными. Контекстные тексты
// остаются у инструмента, а универсальные действия берутся из `common`
// (ADR 0039, ADR 0072, ADR 0078).

import type { PresetBarTexts, PresetDialogTexts } from "@/ui/tool/presets/types";

export const DNS_PRESET_BAR_TEXTS: PresetBarTexts = {
  buttonEmpty: "dnslookup.preset.buttonEmpty",
  changed: "dnslookup.preset.changed",
  revertHint: "dnslookup.preset.revertHint",
  saveHint: "dnslookup.preset.saveHint",
  notSaved: "dnslookup.preset.notSaved",
  revertFailed: "dnslookup.preset.revertFailed",
};

export const DNS_PRESET_DIALOG_TEXTS: PresetDialogTexts = {
  dialogTitle: "dnslookup.preset.dialogTitle",
  close: "common.close",
  current: {
    changed: "dnslookup.preset.currentChanged",
    none: "dnslookup.preset.none",
    noneHint: "dnslookup.preset.noneHint",
    revertHint: "dnslookup.preset.revertHint",
    saveChanges: "common.save",
  },
  list: {
    loading: "dnslookup.preset.listLoading",
    empty: "dnslookup.preset.listEmpty",
  },
  row: {
    badgeDefault: "dnslookup.preset.badgeDefault",
    unknownSavedAt: "dnslookup.preset.unknownSavedAt",
    renameAria: "dnslookup.preset.renameAria",
    renameSave: "dnslookup.preset.renameSave",
    renameCancel: "dnslookup.preset.renameCancel",
    loadAria: "dnslookup.preset.loadAria",
    loadTip: "dnslookup.preset.loadTip",
    loadTipAria: "dnslookup.preset.loadTipAria",
    renameTip: "dnslookup.preset.renameTip",
    renameTipAria: "dnslookup.preset.renameTipAria",
    duplicateTip: "dnslookup.preset.duplicateTip",
    duplicateAria: "dnslookup.preset.duplicateAria",
    deleteTip: "common.delete",
    deleteAria: "dnslookup.preset.deleteAria",
    makeDefault: "dnslookup.preset.makeDefault",
    clearDefault: "dnslookup.preset.clearDefault",
  },
  create: {
    newTitle: "dnslookup.preset.newTitle",
    saveAs: "dnslookup.preset.saveAs",
  },
  confirm: {
    loadAccept: "dnslookup.preset.loadAccept",
    deleteAccept: "common.delete",
    cancel: "common.cancel",
    deleteMessage: "dnslookup.preset.deleteMessage",
    replaceMessage: "dnslookup.preset.replaceMessage",
    replaceRunningMessage: "dnslookup.preset.replaceRunningMessage",
  },
  notes: {
    defaultError: "dnslookup.preset.defaultError",
    defaultCleared: "dnslookup.preset.defaultCleared",
    defaultSet: "dnslookup.preset.defaultSet",
    loadError: "dnslookup.preset.loadError",
    loaded: "dnslookup.preset.loaded",
    loadedWarnings: "dnslookup.preset.loadedWarnings",
    saved: "dnslookup.preset.saved",
    notSaved: "dnslookup.preset.notSaved",
    revertFailed: "dnslookup.preset.revertFailed",
    created: "dnslookup.preset.created",
    notCreated: "dnslookup.preset.notCreated",
    renamed: "dnslookup.preset.renamed",
    notRenamed: "dnslookup.preset.notRenamed",
    copied: "dnslookup.preset.copied",
    notCopied: "dnslookup.preset.notCopied",
    removed: "dnslookup.preset.removed",
    notRemoved: "dnslookup.preset.notRemoved",
  },
};

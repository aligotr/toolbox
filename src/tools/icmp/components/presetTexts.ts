// Ключи видимых текстов пресетов Ping.
//
// Общие компоненты пресетов берут подписи данными: ключи остаются
// у инструмента, поэтому внешние словари не ломаются при унификации
// интерфейса (ADR 0039, ADR 0072).

import type { PresetBarTexts, PresetDialogTexts } from "@/ui/tool/presets/types";

export const ICMP_PRESET_BAR_TEXTS: PresetBarTexts = {
  buttonEmpty: "icmp.preset.buttonEmpty",
  changed: "icmp.preset.changed",
  revertHint: "icmp.preset.revertHint",
  saveHint: "icmp.preset.saveHint",
  notSaved: "icmp.preset.notSaved",
  revertFailed: "icmp.preset.revertFailed",
};

export const ICMP_PRESET_DIALOG_TEXTS: PresetDialogTexts = {
  dialogTitle: "icmp.preset.dialogTitle",
  close: "icmp.preset.close",
  current: {
    changed: "icmp.preset.currentChanged",
    none: "icmp.preset.none",
    noneHint: "icmp.preset.noneHint",
    revertHint: "icmp.preset.revertHint",
    saveChanges: "icmp.preset.saveChanges",
  },
  list: {
    loading: "icmp.preset.listLoading",
    empty: "icmp.preset.listEmpty",
  },
  row: {
    badgeDefault: "icmp.preset.badgeDefault",
    unknownSavedAt: "icmp.preset.unknownSavedAt",
    renameAria: "icmp.preset.renameAria",
    renameSave: "icmp.preset.renameSave",
    renameCancel: "icmp.preset.renameCancel",
    loadAria: "icmp.preset.loadAria",
    loadTip: "icmp.preset.loadTip",
    loadTipAria: "icmp.preset.loadTipAria",
    renameTip: "icmp.preset.renameTip",
    renameTipAria: "icmp.preset.renameTipAria",
    duplicateTip: "icmp.preset.duplicateTip",
    duplicateAria: "icmp.preset.duplicateAria",
    deleteTip: "icmp.preset.deleteTip",
    deleteAria: "icmp.preset.deleteAria",
    makeDefault: "icmp.preset.makeDefault",
    clearDefault: "icmp.preset.clearDefault",
  },
  create: {
    newTitle: "icmp.preset.newTitle",
    saveAs: "icmp.preset.saveAs",
  },
  confirm: {
    loadAccept: "icmp.preset.loadAccept",
    deleteAccept: "icmp.preset.deleteAccept",
    cancel: "icmp.preset.cancel",
    deleteMessage: "icmp.preset.deleteMessage",
    replaceMessage: "icmp.preset.replaceMessage",
    replaceRunningMessage: "icmp.preset.replaceRunningMessage",
  },
  notes: {
    defaultError: "icmp.preset.defaultError",
    defaultCleared: "icmp.preset.defaultCleared",
    defaultSet: "icmp.preset.defaultSet",
    loadError: "icmp.preset.loadError",
    loaded: "icmp.preset.loaded",
    loadedWarnings: "icmp.preset.loadedWarnings",
    saved: "icmp.preset.saved",
    notSaved: "icmp.preset.notSaved",
    revertFailed: "icmp.preset.revertFailed",
    created: "icmp.preset.created",
    notCreated: "icmp.preset.notCreated",
    renamed: "icmp.preset.renamed",
    notRenamed: "icmp.preset.notRenamed",
    copied: "icmp.preset.copied",
    notCopied: "icmp.preset.notCopied",
    removed: "icmp.preset.removed",
    notRemoved: "icmp.preset.notRemoved",
  },
};

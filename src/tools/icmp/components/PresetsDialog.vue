<script setup lang="ts">
// Диалог пресетов Ping: тонкая привязка общего компонента к сеансу.
//
// Формат payload, применение и откат принадлежат инструменту (ADR 0028);
// разметку, список и действия держит общий диалог.

import { t } from "@/core/infra/i18n";
import ToolPresetsDialog from "@/ui/tool/presets/ToolPresetsDialog.vue";
import type { PresetDialogSource } from "@/ui/tool/presets/types";
import {
  adoptPresetTitle,
  applyPreset,
  createPresetFromSession,
  icmpPresetChanged,
  icmpPresets,
  releaseDeletedPreset,
  revertPresetChanges,
  savePresetToCurrent,
} from "../presets";
import type { IcmpSession } from "../types";
import { ICMP_PRESET_DIALOG_TEXTS } from "./presetTexts";

const props = defineProps<{
  visible: boolean;
  session: IcmpSession;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  applied: [];
}>();

/** Источник операций диалога: сеанс Ping и его пресеты. */
const source: PresetDialogSource = {
  presets: icmpPresets,
  get bound() {
    return props.session.presetId !== null;
  },
  get presetTitle() {
    return props.session.presetTitle;
  },
  get changed() {
    return icmpPresetChanged(props.session);
  },
  get occupied() {
    return props.session.targets.length > 0;
  },
  get running() {
    return props.session.status.run.loading;
  },
  load: (preset) => applyPreset(props.session, preset),
  revert: async () => {
    const result = await revertPresetChanges(props.session);
    return {
      error: result.error,
      message: result.cleared ? t("icmp.preset.revertedCleared") : t("icmp.preset.reverted"),
    };
  },
  save: () => savePresetToCurrent(props.session),
  create: (title) => createPresetFromSession(props.session, title),
  adoptTitle: (preset) => adoptPresetTitle(props.session, preset),
  releaseDeleted: (presetId) => releaseDeletedPreset(props.session, presetId),
};
</script>

<template>
  <ToolPresetsDialog
    :visible="visible"
    :source="source"
    :texts="ICMP_PRESET_DIALOG_TEXTS"
    @update:visible="emit('update:visible', $event)"
    @applied="emit('applied')"
  />
</template>

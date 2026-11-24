<script setup lang="ts">
// Диалог пресетов DNS: тонкая привязка общего компонента к сеансу.
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
  dnsPresetChanged,
  dnsPresets,
  releaseDeletedPreset,
  revertPresetChanges,
  savePresetToCurrent,
} from "../presets";
import type { DnsSession } from "../types";
import { DNS_PRESET_DIALOG_TEXTS } from "./presetTexts";

const props = defineProps<{
  visible: boolean;
  session: DnsSession;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  applied: [];
}>();

/** Источник операций диалога: сеанс DNS и его пресеты. */
const source: PresetDialogSource = {
  presets: dnsPresets,
  get bound() {
    return props.session.presetId !== null;
  },
  get presetTitle() {
    return props.session.presetTitle;
  },
  get changed() {
    return dnsPresetChanged(props.session);
  },
  get occupied() {
    return props.session.rows.length > 0;
  },
  get running() {
    return props.session.status.run.loading;
  },
  load: (preset) => applyPreset(props.session, preset),
  revert: async () => {
    const result = await revertPresetChanges(props.session);
    return {
      error: result.error,
      message: result.restarted
        ? t("dnslookup.preset.revertedRestarted")
        : t("dnslookup.preset.reverted"),
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
    :texts="DNS_PRESET_DIALOG_TEXTS"
    @update:visible="emit('update:visible', $event)"
    @applied="emit('applied')"
  />
</template>

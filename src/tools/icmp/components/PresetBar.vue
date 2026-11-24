<script setup lang="ts">
// Панель пресета Ping: тонкая привязка общего компонента к сеансу.
//
// Вид и короткие действия одинаковы у инструментов; здесь только источник
// операций и ключи подписей Ping.

import ToolPresetBar from "@/ui/tool/presets/ToolPresetBar.vue";
import { TOOL_TITLE } from "../constants";
import {
  icmpPresetChanged,
  icmpPresets,
  revertPresetChanges,
  savePresetToCurrent,
} from "../presets";
import type { IcmpSession } from "../types";
import { ICMP_PRESET_BAR_TEXTS } from "./presetTexts";

const props = defineProps<{ session: IcmpSession }>();

const emit = defineEmits<{
  open: [];
  note: [text: string | null];
}>();

const save = () => savePresetToCurrent(props.session);
const revert = () => revertPresetChanges(props.session);
</script>

<template>
  <ToolPresetBar
    :title="TOOL_TITLE"
    :preset-title="session.presetTitle"
    :changed="icmpPresetChanged(session)"
    :saving="icmpPresets.status.update.loading"
    :save-error="icmpPresets.status.update.error"
    :texts="ICMP_PRESET_BAR_TEXTS"
    :save="save"
    :revert="revert"
    @open="emit('open')"
    @note="emit('note', $event)"
  />
</template>

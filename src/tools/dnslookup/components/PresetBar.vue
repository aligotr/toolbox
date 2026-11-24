<script setup lang="ts">
// Панель пресета DNS: тонкая привязка общего компонента к сеансу.
//
// Вид и короткие действия одинаковы у инструментов; здесь только источник
// операций и ключи подписей DNS.

import ToolPresetBar from "@/ui/tool/presets/ToolPresetBar.vue";
import { TOOL_TITLE } from "../constants";
import { dnsPresetChanged, dnsPresets, revertPresetChanges, savePresetToCurrent } from "../presets";
import type { DnsSession } from "../types";
import { DNS_PRESET_BAR_TEXTS } from "./presetTexts";

const props = defineProps<{ session: DnsSession }>();

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
    :changed="dnsPresetChanged(session)"
    :saving="dnsPresets.status.update.loading"
    :save-error="dnsPresets.status.update.error"
    :texts="DNS_PRESET_BAR_TEXTS"
    :save="save"
    :revert="revert"
    @open="emit('open')"
    @note="emit('note', $event)"
  />
</template>

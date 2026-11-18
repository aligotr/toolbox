<script setup lang="ts">
// Диалог своих DNS-серверов.
//
// Список и сохранение принадлежат профилю, поэтому диалог ничего не пишет сам:
// он проверяет ввод и отдаёт событие, а родитель сохраняет через шину.
// Пока идёт сохранение, кнопка заблокирована; ошибка ядра показывается здесь же.

import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import { computed, ref, watch } from "vue";
import { t } from "@/core/infra/i18n";
import { DIALOG_WIDTH } from "../constants";
import { parseServerAddress } from "../normalize";
import type { ServerOption } from "../types";

const props = defineProps<{
  visible: boolean;
  servers: ServerOption[];
  /** Канонические адреса всех доступных серверов: дубликаты не добавляются. */
  occupied: string[];
  saving: boolean;
  /** Файл профиля повреждён: запись запрещена до исправления. */
  blocked: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  add: [payload: { label: string; address: string }];
  remove: [serverId: string];
}>();

const address = ref("");
const label = ref("");
const localError = ref<string | null>(null);

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    address.value = "";
    label.value = "";
    localError.value = null;
  },
);

const shownError = computed(() => localError.value ?? props.error);
const locked = computed(() => props.saving || props.blocked);

function submit(): void {
  localError.value = null;
  const parsed = parseServerAddress(address.value);
  if (!parsed.ok) {
    localError.value = t(parsed.code, parsed.params);
    return;
  }
  if (props.occupied.includes(parsed.address)) {
    localError.value = t("dnslookup.servers.duplicate");
    return;
  }

  emit("add", {
    label: label.value.trim() || parsed.address,
    address: parsed.address,
  });
}

function remove(serverId: string): void {
  localError.value = null;
  emit("remove", serverId);
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="t('dnslookup.servers.title')"
    modal
    dismissable-mask
    :draggable="false"
    :style="{ width: DIALOG_WIDTH, maxWidth: '92vw' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="servers">
      <section class="servers__list">
        <h3 class="servers__title">{{ t("dnslookup.servers.added") }}</h3>
        <p v-if="servers.length === 0" class="servers__empty">
          {{ t("dnslookup.servers.empty") }}
        </p>
        <ul v-else class="servers__items">
          <li v-for="server in servers" :key="server.id" class="servers__item">
            <code class="servers__address">{{ server.address }}</code>
            <span class="servers__label">{{ server.label }}</span>
            <Button
              icon="pi pi-trash"
              severity="danger"
              text
              size="small"
              :aria-label="t('dnslookup.servers.removeAria', { address: server.address ?? '' })"
              :disabled="locked"
              @click="remove(server.id)"
            />
          </li>
        </ul>
      </section>

      <section class="servers__form">
        <label class="servers__field">
          <span class="servers__field-label">{{ t("dnslookup.servers.address") }}</span>
          <InputText
            v-model="address"
            placeholder="10.0.0.53:53"
            :aria-label="t('dnslookup.servers.addressAria')"
            :disabled="locked"
            @keyup.enter="submit"
          />
        </label>

        <label class="servers__field">
          <span class="servers__field-label">{{ t("dnslookup.servers.name") }}</span>
          <InputText
            v-model="label"
            :placeholder="t('dnslookup.servers.namePlaceholder')"
            :aria-label="t('dnslookup.servers.nameAria')"
            :disabled="locked"
            @keyup.enter="submit"
          />
        </label>

        <p class="servers__hint">{{ t("dnslookup.servers.hint") }}</p>
        <p v-if="blocked" class="servers__error" role="alert">
          <i class="pi pi-exclamation-triangle" aria-hidden="true" />
          {{ t("dnslookup.servers.blocked") }}
        </p>
        <p v-if="shownError" class="servers__error" role="alert">
          <i class="pi pi-exclamation-circle" aria-hidden="true" />
          {{ shownError }}
        </p>
      </section>
    </div>

    <template #footer>
      <Button
        :label="t('dnslookup.servers.cancel')"
        text
        :disabled="locked"
        @click="emit('update:visible', false)"
      />
      <Button
        :label="t('dnslookup.servers.add')"
        icon="pi pi-plus"
        :loading="saving"
        :disabled="locked || address.trim() === ''"
        @click="submit"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.servers {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-xl);
}

.servers__title {
  margin: 0 0 var(--ag-space-sm);
  font-size: var(--ag-text-md);
  font-weight: 600;
}

.servers__empty {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-sm);
}

.servers__items {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}

.servers__item {
  display: flex;
  align-items: center;
  gap: var(--ag-space-md);
  padding: var(--ag-space-sm) var(--ag-space-sm) var(--ag-space-sm) var(--ag-space-lg);
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-sm);
}

.servers__address {
  flex-shrink: 0;
  font-family: var(--ag-font-mono);
  font-size: var(--ag-text-xs);
}

.servers__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.servers__form {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-md);
}

.servers__field {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-xs);
}

.servers__field-label {
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.servers__hint {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.servers__error {
  display: flex;
  align-items: flex-start;
  gap: var(--ag-space-sm);
  margin: 0;
  color: var(--ag-danger);
  font-size: var(--ag-text-xs);
}
</style>

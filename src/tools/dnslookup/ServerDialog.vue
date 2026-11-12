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
import { DIALOG_WIDTH } from "./constants";
import { parseServerAddress } from "./normalize";
import type { ServerOption } from "./types";

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
    localError.value = parsed.error;
    return;
  }
  if (props.occupied.includes(parsed.address)) {
    localError.value = "Адрес уже добавлен";
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
    header="Свои DNS-серверы"
    modal
    :draggable="false"
    :style="{ width: DIALOG_WIDTH, maxWidth: '92vw' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="servers">
      <section class="servers__list">
        <h3 class="servers__title">Добавленные</h3>
        <p v-if="servers.length === 0" class="servers__empty">
          Своих серверов пока нет
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
              :aria-label="`Удалить сервер ${server.address}`"
              :disabled="locked"
              @click="remove(server.id)"
            />
          </li>
        </ul>
      </section>

      <section class="servers__form">
        <label class="servers__field">
          <span class="servers__field-label">Адрес</span>
          <InputText
            v-model="address"
            placeholder="10.0.0.53:53"
            aria-label="Адрес DNS-сервера"
            :disabled="locked"
            @keyup.enter="submit"
          />
        </label>

        <label class="servers__field">
          <span class="servers__field-label">Название (необязательно)</span>
          <InputText
            v-model="label"
            placeholder="Локальный DNS"
            aria-label="Название DNS-сервера"
            :disabled="locked"
            @keyup.enter="submit"
          />
        </label>

        <p class="servers__hint">
          Формат: IPv4, IPv4:порт, [IPv6]:порт. Порт по умолчанию — 53.
        </p>
        <p v-if="blocked" class="servers__error" role="alert">
          <i class="pi pi-exclamation-triangle" aria-hidden="true" />
          Сохранение запрещено: исправьте или удалите файл своих серверов
          в профиле.
        </p>
        <p v-if="shownError" class="servers__error" role="alert">
          <i class="pi pi-exclamation-circle" aria-hidden="true" />
          {{ shownError }}
        </p>
      </section>
    </div>

    <template #footer>
      <Button
        label="Отмена"
        text
        :disabled="locked"
        @click="emit('update:visible', false)"
      />
      <Button
        label="Добавить"
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
  gap: 24px;
}

.servers__title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
}

.servers__empty {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 14px;
}

.servers__items {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.servers__item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 8px 8px 16px;
  border: 1px solid var(--ag-border);
  border-radius: 6px;
}

.servers__address {
  flex-shrink: 0;
  font-family: var(--ag-font-mono);
  font-size: 13px;
}

.servers__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--p-text-muted-color);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.servers__form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.servers__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.servers__field-label {
  color: var(--p-text-muted-color);
  font-size: 13px;
}

.servers__hint {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 13px;
}

.servers__error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  color: var(--ag-danger);
  font-size: 13px;
}
</style>

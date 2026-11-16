<script setup lang="ts">
// Диалог названия шаблона: сохранить как новый и переименовать.
//
// Обе операции спрашивают одно и то же — название. Отдельные диалоги
// повторяли бы разметку и расходились бы в правилах: пределе длины, пустом
// значении, поведении при ошибке.
//
// Диалог только собирает название: запись шаблона — сценарий оболочки,
// поэтому он ничего не вызывает сам.

import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import { ref, watch } from "vue";
import { t } from "@/core/infra/i18n";
import { TEMPLATE_TITLE_MAX_LENGTH } from "../constants";

const props = defineProps<{
  visible: boolean;
  header: string;
  submitLabel: string;
  note: string;
  suggestedTitle: string;
  loading: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  save: [title: string];
}>();

/** Название в поле; сбрасывается при каждом открытии. */
const title = ref("");

watch(
  () => props.visible,
  (visible) => {
    if (visible) title.value = props.suggestedTitle;
  },
);

function submit(): void {
  const value = title.value.trim();
  if (value) emit("save", value);
}

function close(): void {
  emit("update:visible", false);
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :header="header"
    :style="{ width: '420px' }"
    @update:visible="emit('update:visible', $event)"
  >
    <form class="title-dialog" @submit.prevent="submit">
      <label class="title-dialog__label" for="template-title">
        {{ t("tabs.title.field") }}
      </label>
      <InputText
        id="template-title"
        v-model="title"
        :placeholder="t('tabs.title.placeholder')"
        :maxlength="TEMPLATE_TITLE_MAX_LENGTH"
        autofocus
      />

      <p class="title-dialog__note">{{ note }}</p>

      <p v-if="error" class="title-dialog__error">{{ error }}</p>

      <footer class="title-dialog__actions">
        <Button
          type="button"
          :label="t('tabs.title.cancel')"
          severity="secondary"
          text
          @click="close"
        />
        <Button
          type="submit"
          :label="submitLabel"
          :loading="loading"
          :disabled="!title.trim()"
        />
      </footer>
    </form>
  </Dialog>
</template>

<style scoped>
.title-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-lg);
}

.title-dialog__label {
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.title-dialog__note {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
  line-height: 1.45;
}

.title-dialog__error {
  margin: 0;
  color: var(--ag-danger);
  font-size: var(--ag-text-xs);
  line-height: 1.45;
}

.title-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ag-space-sm);
}
</style>

<script setup lang="ts">
// Действия строки добавления: принять и отклонить.
//
// Один вид на все табличные инструменты: контурные кнопки размера поля.
// Подпись подтверждения универсальна, отказ называет отменяемое действие.

import Button from "primevue/button";
import { t } from "@/core/infra/i18n";

defineProps<{
  /** Идёт проверка: подтверждение недоступно. */
  disabled?: boolean;
  /** Подпись отказа: у инструмента свой текст отмены. */
  cancelLabel: string;
}>();

const emit = defineEmits<{
  accept: [];
  cancel: [];
}>();
</script>

<template>
  <div class="tool-table__draft-actions">
    <Button
      icon="pi pi-check"
      size="small"
      outlined
      severity="primary"
      :aria-label="t('common.add')"
      :disabled="disabled"
      @click="emit('accept')"
    />
    <Button
      icon="pi pi-times"
      size="small"
      outlined
      severity="secondary"
      :aria-label="cancelLabel"
      @click="emit('cancel')"
    />
  </div>
</template>

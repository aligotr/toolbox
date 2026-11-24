<script setup lang="ts">
// Липкая шапка раскрытия: имя строки, пояснения и «Свернуть».
//
// Шапка остаётся в кадре при прокрутке длинного раскрытия: родительская
// строка уезжает вверх, а имя нужно удерживать. Имя строки приходит пропсом,
// счётчик - слотом `name-addon`, пояснение - слотом по умолчанию; кнопка
// сворачивания живёт здесь, чтобы у обоих инструментов она была одной.

import Button from "primevue/button";

defineProps<{
  /** Имя строки: остаётся в кадре при прокрутке раскрытия. */
  rowName: string;
  /** Подпись кнопки сворачивания. */
  collapseLabel: string;
}>();

defineEmits<{
  collapse: [];
}>();
</script>

<template>
  <div class="tool-table__expansion-head">
    <strong class="tool-table__expansion-name">
      {{ rowName }}
      <slot name="name-addon" />
    </strong>
    <slot />
    <Button
      class="tool-table__expansion-collapse"
      :label="collapseLabel"
      icon="pi pi-chevron-up"
      size="small"
      text
      severity="secondary"
      @click="$emit('collapse')"
    />
  </div>
</template>

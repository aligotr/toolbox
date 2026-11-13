<script setup lang="ts">
// Плоский селект: значение со стрелкой без рамки поля.
//
// Вид нужен там, где рядом данные и рамка с ними спорит: например, тип записи
// в таблице DNS. Стиль живёт в самом контроле, поэтому другие инструменты
// берут его как есть, а не копируют правила из экрана.
//
// Свойства, слоты и `v-model` уходят в PrimeVue Select как есть: обёртка
// ничего не переопределяет, кроме вида.

import Select from "primevue/select";
</script>

<template>
  <Select class="plain-select" />
</template>

<style scoped>
/* Рамку и фон поля заменяет подложка при наведении: место действия видно,
   но строку данных ничто не обводит. */
.plain-select {
  border-color: transparent;
  background: transparent;
}

.plain-select:not(.p-disabled):hover {
  border-color: transparent;
  background: var(--p-content-hover-background);
}

.plain-select:not(.p-disabled).p-focus {
  border-color: transparent;
  background: var(--p-content-hover-background);
  box-shadow: none;
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

/* Внутренние отступы поля тут лишние: текст стоит по краю ячейки. */
.plain-select :deep(.p-select-label) {
  padding-inline: 4px;
}

.plain-select :deep(.p-select-dropdown) {
  width: 24px;
  color: var(--p-text-muted-color);
}
</style>

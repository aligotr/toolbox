<script setup lang="ts">
// Карточка каталога экрана запуска.
//
// Один вид на инструменты и разделы приложения: иконка, название,
// необязательная подпись пресета и описание. Жест выбирает родитель:
// карточка только сообщает о нажатии, поэтому у неё нет знания о вкладках.

defineProps<{
  /** Класс иконки PrimeIcons, например `pi pi-globe`. */
  icon: string;
  title: string;
  /** Строка пресета по умолчанию; пусто - строки нет. */
  preset?: string;
  /** Короткое описание инструмента или раздела. */
  description?: string;
}>();

defineEmits<{
  click: [event: MouseEvent];
  auxclick: [event: MouseEvent];
  keydown: [event: KeyboardEvent];
}>();
</script>

<template>
  <button
    class="catalog-card"
    type="button"
    @click="$emit('click', $event)"
    @auxclick="$emit('auxclick', $event)"
    @keydown="$emit('keydown', $event)"
  >
    <i class="catalog-card__icon" :class="icon" aria-hidden="true" />
    <span class="catalog-card__text">
      <strong class="catalog-card__title">{{ title }}</strong>
      <small v-if="preset" class="catalog-card__detail">{{ preset }}</small>
      <small v-if="description" class="catalog-card__detail">{{ description }}</small>
    </span>
  </button>
</template>

<style scoped>
.catalog-card {
  display: flex;
  align-items: flex-start;
  gap: var(--ag-space-lg);
  padding: var(--ag-space-lg);
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-md);
  background: var(--ag-surface);
  color: var(--p-text-color);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.catalog-card:hover {
  border-color: var(--ag-border-strong);
}

.catalog-card:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.catalog-card__text {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-xs);
  min-width: 0;
}

.catalog-card__title {
  overflow: hidden;
  font-size: var(--ag-text-md);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.catalog-card__detail {
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.catalog-card__icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--p-primary-color);
  font-size: 18px;
}
</style>

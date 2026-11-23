<script setup lang="ts">
// Раздел раскрытия: заголовок и его содержимое.
//
// Заголовок отделяет блоки друг от друга, не превращая раскрытие в ещё одну
// таблицу. Раздел не ограничивает содержимое: карточки, списки и заметки
// остаются за инструментом.

defineProps<{
  title: string;
}>();
</script>

<template>
  <section class="tool-details__section">
    <h3 class="tool-details__title">{{ title }}</h3>
    <slot />
  </section>
</template>

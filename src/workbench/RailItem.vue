<script setup lang="ts">
// Пункт рейла: иконка, подпись и выбранное состояние.
//
// Один контрол на все разделы оболочки: инструмент, раздел приложения и
// профиль выглядят и ведут себя одинаково. Сайдбар передаёт данные и не
// повторяет ни разметку, ни состояния; свёрнутый вид тоже решает пункт.
//
// Подсказка нужна в рейле: в развёрнутом сайдбаре подпись видна, и всплывающая
// подсказка дублировала бы текст. Исключение — подсказка о жесте: она
// объясняет то, чего в подписи нет.

import { computed } from "vue";

const props = defineProps<{
  /** Класс иконки PrimeIcons, например `pi pi-user`. */
  icon: string;
  /** Подпись пункта; в рейле скрывается. */
  title: string;
  /** Доступное имя, если оно шире подписи. */
  label?: string;
  /** Текст подсказки; по умолчанию — подпись. */
  tooltip?: string;
  /** Дополнение к подсказке: например, жест второго экземпляра. */
  hint?: string;
  /** Сайдбар свёрнут: подпись скрыта, подсказка включена. */
  collapsed: boolean;
  /** Пункт открыт в активной вкладке. */
  active?: boolean;
  /** Подпись помельче: профиль стоит особняком от разделов. */
  compact?: boolean;
  /** Шеврон раскрытия: у профиля есть меню, у разделов нет. */
  chevron?: boolean;
}>();

const emit = defineEmits<{
  click: [event: MouseEvent];
  auxclick: [event: MouseEvent];
  keydown: [event: KeyboardEvent];
}>();

/** Доступное имя: подпись пункта, если владелец не задал своё. */
const label = computed(() => props.label ?? props.title);

/** Подсказка пункта: подпись и, если есть, объяснение жеста. */
const tooltip = computed(() => {
  const base = props.tooltip ?? props.title;
  return props.hint ? `${base} · ${props.hint}` : base;
});
</script>

<template>
  <button
    class="rail-item"
    :class="{
      'rail-item--active': active,
      'rail-item--compact': compact,
      'rail-item--collapsed': collapsed,
    }"
    type="button"
    :aria-label="label"
    v-tooltip.right="{ value: tooltip, disabled: !collapsed && !hint }"
    @click="emit('click', $event)"
    @auxclick="emit('auxclick', $event)"
    @keydown="emit('keydown', $event)"
  >
    <i class="rail-item__icon" :class="icon" aria-hidden="true" />
    <span v-if="!collapsed" class="rail-item__title">{{ title }}</span>
    <i
      v-if="chevron && !collapsed"
      class="pi pi-angle-up rail-item__chevron"
      aria-hidden="true"
    />
  </button>
</template>

<style scoped>
.rail-item {
  display: flex;
  align-items: center;
  gap: var(--ag-space-sm);
  width: 100%;
  min-width: 0;
  padding: var(--ag-space-sm);
  border: 0;
  border-radius: var(--ag-radius-md);
  background: transparent;
  color: var(--p-text-muted-color);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.rail-item:hover {
  background: var(--ag-hover);
  color: var(--p-text-color);
}

.rail-item--active {
  background: var(--ag-surface);
  color: var(--p-text-color);
}

.rail-item:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.rail-item--collapsed {
  justify-content: center;
  padding: var(--ag-space-sm) 0;
}

.rail-item__icon {
  flex-shrink: 0;
  width: 18px;
  font-size: 16px;
  text-align: center;
}

.rail-item__title {
  overflow: hidden;
  font-size: var(--ag-text-md);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rail-item--compact .rail-item__title {
  font-size: var(--ag-text-sm);
}

.rail-item__chevron {
  flex-shrink: 0;
  margin-left: auto;
  font-size: var(--ag-text-xs);
}
</style>

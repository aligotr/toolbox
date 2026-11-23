<script setup lang="ts">
// Числовое поле параметра инструмента.
//
// Поле не прячет неверный ввод и не подставляет умолчание на лету:
// пользователь должен увидеть, что именно вне пределов, а вызывающий
// проверит диапазон ещё раз. Поэтому пустое поле становится нулём
// и подсвечивается.
//
// Подпись стоит в одной строке с полем: строка параметров остаётся одной
// полосой, а не двумя этажами подписей и контролов.

import InputText from "primevue/inputtext";

defineProps<{
  id: string;
  label: string;
  modelValue: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  invalid: boolean;
  disabled: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: number];
}>();

/** Приведение ввода поля к числу: пустая строка - ноль, а не NaN. */
function onInput(value: string | undefined): void {
  const parsed = Number.parseInt(value ?? "", 10);
  emit("update:modelValue", Number.isNaN(parsed) ? 0 : parsed);
}
</script>

<template>
  <label class="tool-param" :for="id">
    <span class="tool-param__label">{{ label }}</span>
    <InputText
      :id="id"
      :model-value="String(modelValue)"
      type="number"
      :min="min"
      :max="max"
      :step="step"
      size="small"
      :class="{ 'p-invalid': invalid }"
      :aria-invalid="invalid"
      :disabled="disabled"
      @update:model-value="onInput"
    />
    <span v-if="unit" class="tool-param__unit">{{ unit }}</span>
  </label>
</template>

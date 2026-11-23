<script setup lang="ts">
// Числовое поле параметра проверки.
//
// Поле не прячет неверный ввод и не подставляет умолчание на лету:
// пользователь должен увидеть, что именно вне пределов, а запуск проверит
// диапазон ещё раз. Поэтому пустое поле становится нулём и подсвечивается.

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

/** Приводит ввод поля к числу: пустая строка - ноль, а не NaN. */
function onInput(value: string | undefined): void {
  const parsed = Number.parseInt(value ?? "", 10);
  emit("update:modelValue", Number.isNaN(parsed) ? 0 : parsed);
}
</script>

<template>
  <label class="icmp-param" :for="id">
    <span class="icmp-param__label">{{ label }}</span>
    <span class="icmp-param__field">
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
      <span class="icmp-param__unit">{{ unit }}</span>
    </span>
  </label>
</template>

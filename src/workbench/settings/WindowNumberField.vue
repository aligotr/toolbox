<script setup lang="ts">
// Числовое поле окна: подпись слева, поле справа, ошибка под полем.
//
// Подпись связана с полем через `id`, поэтому клик по подписи ставит курсор
// в поле. Ошибка идёт отдельной строкой под своим полем.

import InputText from "primevue/inputtext";

defineProps<{
  id: string;
  label: string;
  accessibleLabel: string;
  modelValue: string;
  error: string;
  placeholder?: string;
}>();

defineEmits<{
  "update:modelValue": [value: string];
  submit: [];
  cancel: [];
}>();
</script>

<template>
  <div class="number-field">
    <div class="number-field__line">
      <label class="number-field__label" :for="id">{{ label }}</label>
      <InputText
        :id="id"
        :model-value="modelValue"
        class="number-field__input"
        size="small"
        inputmode="numeric"
        autocomplete="off"
        spellcheck="false"
        :class="{ 'p-invalid': error }"
        :aria-invalid="error !== ''"
        :aria-label="accessibleLabel"
        :placeholder="placeholder ?? ''"
        @update:model-value="$emit('update:modelValue', $event ?? '')"
        @keydown.enter.prevent="$emit('submit')"
        @keydown.esc="$emit('cancel')"
      />
    </div>

    <p v-if="error" class="number-field__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.number-field {
  display: flex;
  flex-direction: column;
}

.number-field__line {
  display: flex;
  align-items: center;
  gap: var(--ag-space-sm);
}

.number-field__label {
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.number-field__input {
  width: 96px;
}

.number-field__error {
  margin: 0;
  padding-top: var(--ag-space-xs);
  color: var(--ag-danger);
  font-size: var(--ag-text-xs);
}
</style>

<script setup lang="ts">
// Подтверждение закрытия вкладки с несохранёнными правками.
//
// PrimeVue ConfirmationService умеет только два ответа, а здесь нужно три:
// записать правки, закрыть без записи или остаться. Поэтому обычный диалог
// с явными кнопками: «Отмена» не должна выглядеть как отказ от закрытия,
// который нельзя отменить.
//
// Если шаблон удалён, сохранять некуда — кнопка записи недоступна, и это
// сказано текстом. Молча закрыть вкладку с правками нельзя: пользователь
// должен понимать, что они пропадут.

import Button from "primevue/button";
import Dialog from "primevue/dialog";
import { computed } from "vue";
import {
  CLOSE_TAB_CANCEL,
  CLOSE_TAB_DISCARD,
  CLOSE_TAB_HEADER,
  CLOSE_TAB_SAVE,
} from "../constants";

const props = defineProps<{
  visible: boolean;
  tabTitle: string;
  templateTitle: string | null;
  saving: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  save: [];
  discard: [];
}>();

/** Текст зависит от того, есть ли куда сохранять. */
const message = computed(() => {
  if (props.templateTitle) {
    return (
      `Вкладка «${props.tabTitle}» отличается от шаблона «${props.templateTitle}». ` +
      "Записать изменения в шаблон?"
    );
  }
  return (
    `Шаблон вкладки «${props.tabTitle}» удалён — сохранять изменения некуда. ` +
    "Вкладку можно закрыть без записи."
  );
});

function cancel(): void {
  emit("update:visible", false);
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :header="CLOSE_TAB_HEADER"
    :style="{ width: '460px' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="close-tab">
      <p class="close-tab__message">{{ message }}</p>

      <p v-if="error" class="close-tab__error">{{ error }}</p>

      <footer class="close-tab__actions">
        <Button
          type="button"
          :label="CLOSE_TAB_CANCEL"
          severity="secondary"
          text
          @click="cancel"
        />
        <Button
          type="button"
          :label="CLOSE_TAB_DISCARD"
          severity="secondary"
          outlined
          :disabled="saving"
          @click="emit('discard')"
        />
        <Button
          type="button"
          :label="CLOSE_TAB_SAVE"
          :loading="saving"
          :disabled="!templateTitle"
          @click="emit('save')"
        />
      </footer>
    </div>
  </Dialog>
</template>

<style scoped>
.close-tab {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-lg);
}

.close-tab__message {
  margin: 0;
  color: var(--p-text-color);
  font-size: var(--ag-text-sm);
  line-height: 1.5;
}

.close-tab__error {
  margin: 0;
  color: var(--ag-danger);
  font-size: var(--ag-text-xs);
  line-height: 1.45;
}

.close-tab__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--ag-space-sm);
}
</style>

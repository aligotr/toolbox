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
import { t } from "@/core/infra/i18n";

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
    return t("tabs.close.message", {
      tab: props.tabTitle,
      template: props.templateTitle,
    });
  }
  return t("tabs.close.missing", { tab: props.tabTitle });
});

function cancel(): void {
  emit("update:visible", false);
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :header="t('tabs.close.header')"
    :style="{ width: '460px' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="close-tab">
      <p class="close-tab__message">{{ message }}</p>

      <p v-if="error" class="close-tab__error">{{ error }}</p>

      <footer class="close-tab__actions">
        <Button
          type="button"
          :label="t('tabs.close.cancel')"
          severity="secondary"
          text
          @click="cancel"
        />
        <Button
          type="button"
          :label="t('tabs.close.discard')"
          severity="secondary"
          outlined
          :disabled="saving"
          @click="emit('discard')"
        />
        <Button
          type="button"
          :label="t('tabs.close.save')"
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

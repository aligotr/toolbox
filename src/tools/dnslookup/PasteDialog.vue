<script setup lang="ts">
// Диалог вставки списка доменов.
//
// Разбор вынесен в `normalize.ts`: те же правила действуют при одиночном
// добавлении, и второй экземпляр проверки неизбежно разошёлся бы с первым.
// Родитель получает уже проверенные строки и решает, запускать ли проверку:
// «Добавить» только добавляет, «Добавить и проверить» запускает все строки.

import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Textarea from "primevue/textarea";
import { computed, ref, watch } from "vue";
import { DIALOG_WIDTH } from "./constants";
import { parsePaste } from "./normalize";
import type { RecordType } from "./types";

const props = defineProps<{
  visible: boolean;
  type: RecordType;
  /** Ключи `имя|тип` уже добавленных строк: по ним считаются дубликаты. */
  existing: string[];
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  submit: [payload: { lines: string[]; run: boolean }];
}>();

const text = ref("");

/** Поля сбрасываются при каждом открытии: прошлый список не тянется. */
watch(
  () => props.visible,
  (visible) => {
    if (visible) text.value = "";
  },
);

const report = computed(() => parsePaste(text.value, props.type, props.existing));

const total = computed(() => report.value.lines.length);

function close(): void {
  emit("update:visible", false);
}

function submit(run: boolean): void {
  if (total.value === 0) return;
  emit("submit", { lines: report.value.lines, run });
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Вставить список доменов"
    modal
    :draggable="false"
    :style="{ width: DIALOG_WIDTH, maxWidth: '92vw' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="paste">
      <p class="paste__hint">
        По одному в строке. Тип записи — текущий в строке добавления
        (<code>{{ type }}</code>); его можно изменить у каждой строки после
        добавления.
      </p>

      <Textarea
        v-model="text"
        rows="10"
        auto-resize
        class="paste__text"
        aria-label="Список доменов, по одному в строке"
        placeholder="example.com&#10;google.com&#10;8.8.8.8"
      />

      <p class="paste__counts">
        Добавлено {{ total }} · пропущено дублей {{ report.duplicates }} ·
        ошибок {{ report.errors }}
      </p>
      <p v-if="report.firstError" class="paste__error">
        <i class="pi pi-exclamation-circle" aria-hidden="true" />
        {{ report.firstError }}
      </p>
    </div>

    <template #footer>
      <Button label="Отмена" text @click="close" />
      <Button
        label="Добавить"
        severity="secondary"
        outlined
        :disabled="total === 0"
        @click="submit(false)"
      />
      <Button
        label="Добавить и проверить"
        icon="pi pi-play"
        :disabled="total === 0"
        @click="submit(true)"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.paste {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.paste__hint {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 14px;
  line-height: 1.5;
}

.paste__hint code {
  font-family: var(--ag-font-mono);
  font-size: 13px;
}

.paste__text {
  width: 100%;
  font-family: var(--ag-font-mono);
  font-size: 14px;
}

.paste__counts {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 13px;
}

.paste__error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  color: var(--p-red-400);
  font-size: 13px;
}
</style>

<script setup lang="ts">
// Единственное место, где уведомления становятся тостами (ADR 0058).
//
// Приёмник один: сюда приходят события ядра из шины и прямые вызовы
// интерфейса. Здесь же живут ограничение «не больше трёх» и замена
// по группе: PrimeVue сам этого не делает.

import Toast, { type ToastMessageOptions } from "primevue/toast";
import { useToast } from "primevue/usetoast";
import { onMounted, onUnmounted } from "vue";
import {
  clearNotificationSink,
  NOTICE_LIMIT,
  setNotificationSink,
  type NoticeKind,
  type QueuedNotice,
} from "@/core/infra/notifications";

/** Время жизни по виду: ошибка ждёт, пока её прочитают. */
const LIFE: Record<NoticeKind, number> = {
  info: 3000,
  success: 3000,
  warn: 5000,
  error: 0,
};

interface Shown {
  id: number;
  group?: string;
  message: ToastMessageOptions & { id: number };
}

const toast = useToast();
const active: Shown[] = [];

/** Убирает тост и его запись из списка видимых. */
function drop(shown: Shown): void {
  toast.remove(shown.message);
  const index = active.indexOf(shown);
  if (index !== -1) active.splice(index, 1);
}

/** Показывает уведомление: группа заменяет, четвёртое вытесняет старое. */
function show(notice: QueuedNotice): void {
  if (notice.group) {
    const same = active.find((shown) => shown.group === notice.group);
    if (same) drop(same);
  }

  while (active.length >= NOTICE_LIMIT) drop(active[0]);

  const message = {
    id: notice.id,
    severity: notice.kind,
    summary: notice.text,
    life: LIFE[notice.kind],
    closable: true,
  };

  toast.add(message);
  active.push({ id: notice.id, group: notice.group, message });
}

/** Забывает тост, закрытый крестиком или по времени. */
function prune(event: { message?: ToastMessageOptions & { id?: number } }): void {
  const id = event.message?.id;
  const index = active.findIndex((shown) => shown.id === id);
  if (index !== -1) active.splice(index, 1);
}

onMounted(() => setNotificationSink(show));
onUnmounted(() => clearNotificationSink());
</script>

<template>
  <Toast position="bottom-right" @close="prune" @life-end="prune" />
</template>

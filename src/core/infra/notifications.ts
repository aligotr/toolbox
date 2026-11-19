// Уведомления поверх экрана (ADR 0058).
//
// Один приёмник: событие шины `core:notify` от ядра и прямой вызов
// из интерфейса. Перевод и запасной текст - здесь; отрисовка - в
// `NotificationHost`, потому что PrimeVue не место в ядре.
//
// Пока хост не смонтирован, уведомления копятся в очереди: стартовая
// проверка может сработать раньше первого кадра.

import type { UnlistenFn } from "@tauri-apps/api/event";
import type { NoticePayload } from "@/contracts/notifications";
import { subscribeEvent } from "./bus.ts";
import { appErrorOf } from "./errors.ts";
import { hasMessage, t } from "./i18n/index.ts";
import type { MessageParams } from "./i18n/types.ts";

export type { NoticeKind } from "@/contracts/notifications";

/** Уведомление из шины: код словаря и подстановки. */
export type Notice = NoticePayload;

/** Уведомление, готовое к показу. */
export interface QueuedNotice extends Notice {
  id: number;
  text: string;
}

/** Сколько уведомлений держит очередь до показа. */
export const NOTICE_LIMIT = 3;

/** Текст уведомления: перевод по коду или русский резерв. */
export function noticeText(
  notice: Notice,
  translate: (key: string, params?: MessageParams) => string = t,
  knows: (key: string) => boolean = hasMessage,
): string {
  if (knows(notice.code)) return translate(notice.code, notice.params);
  return notice.fallback ?? notice.code;
}

/** Показывает отказ операции уведомлением: код переводит словарь. */
export function notifyError(error: unknown, group: string): void {
  const coded = appErrorOf(error);
  notify({
    kind: "error",
    code: coded.code,
    params: coded.params,
    fallback: coded.fallback,
    group,
  });
}

/** Добавляет уведомление в очередь: группа заменяет, длина ограничена. */
export function bufferNotice(
  queue: readonly QueuedNotice[],
  notice: QueuedNotice,
  limit = NOTICE_LIMIT,
): QueuedNotice[] {
  const rest = notice.group ? queue.filter((item) => item.group !== notice.group) : [...queue];
  return [...rest, notice].slice(-limit);
}

let nextId = 0;
let sink: ((notice: QueuedNotice) => void) | null = null;
let unlisten: UnlistenFn | null = null;
let pending: QueuedNotice[] = [];

/** Показывает уведомление или копит его до появления приёмника. */
export function notify(notice: Notice): void {
  const ready: QueuedNotice = {
    ...notice,
    id: (nextId += 1),
    text: noticeText(notice),
  };

  if (sink) {
    sink(ready);
    return;
  }

  pending = bufferNotice(pending, ready);
}

/** Подключает приёмник и отдаёт ему накопленное. */
export function setNotificationSink(next: (notice: QueuedNotice) => void): void {
  sink = next;
  const buffered = pending;
  pending = [];
  for (const notice of buffered) next(notice);
}

/** Отключает приёмник: очередь снова копит до следующего хоста. */
export function clearNotificationSink(): void {
  sink = null;
}

/** Подписывается на уведомления ядра. Повторный вызов ничего не меняет. */
export async function startNotifications(): Promise<void> {
  if (unlisten) return;
  unlisten = await subscribeEvent<Notice>("core:notify", (payload) => notify(payload));
}

/** Отписывается от уведомлений ядра. */
export function stopNotifications(): void {
  unlisten?.();
  unlisten = null;
}

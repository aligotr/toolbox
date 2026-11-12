//! Мост между интерфейсом и шиной сообщений в Rust.
//!
//! В интерфейсе нет своей шины: Vue только отправляет сообщения в Rust
//! и слушает события оттуда. Все правила — «один владелец команды»,
//! «много подписчиков события», корреляция запрос/ответ — живут в ядре.
//!
//! Четыре операции моста:
//!
//! * `sendEvent`      — событие «выстрелил и забыл» (асинхронно в ядре);
//! * `invokeCommand`  — команда (синхронно, ровно один обработчик, ошибка
//!                      возвращается как отклонённый Promise);
//! * `ask`            — запрос/ответ поверх событий: подставляет `correlation_id`,
//!                      ждёт ответное событие и отдаёт его нагрузку;
//! * `subscribeEvent` — подписка на событие из Rust.
//!
//! Имена топиков используют двоеточие (`core:ping`), потому что Tauri
//! разрешает в именах событий только буквы, цифры, `-`, `/`, `:` и `_`.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** Полезная нагрузка сообщения: произвольный JSON-объект. */
export type Payload = Record<string, unknown>;

/** Публикует событие без ожидания результата. */
export async function sendEvent(topic: string, payload: Payload = {}): Promise<void> {
  await invoke("send_event", { topic, payload });
}

/** Выполняет команду. Ошибка ядра придёт как отклонённый Promise. */
export async function invokeCommand(topic: string, payload: Payload = {}): Promise<void> {
  await invoke("invoke_command", { topic, payload });
}

/**
 * Запрос/ответ поверх событий.
 *
 * `topic` — событие-запрос, `replyTopic` — событие-ответ. Ядро само добавит
 * `correlation_id` в нагрузку запроса и вернёт нагрузку первого ответа
 * с тем же идентификатором.
 */
export async function ask<T = unknown>(
  topic: string,
  replyTopic: string,
  payload: Payload = {},
  timeoutMs = 5000,
): Promise<T> {
  return invoke<T>("ask", { topic, replyTopic, payload, timeoutMs });
}

/**
 * Запрос/ответ с записью учебной цепочки.
 *
 * Отличие от `ask` только одно: ядро взводит запись и присылает готовую
 * цепочку событием `core:trace`. Обычные запросы приложения не трассируются.
 */
export async function askTraced<T = unknown>(
  topic: string,
  replyTopic: string,
  payload: Payload = {},
  timeoutMs = 5000,
): Promise<T> {
  return invoke<T>("ask_traced", { topic, replyTopic, payload, timeoutMs });
}

/**
 * Подписка на событие из Rust.
 *
 * Возвращает функцию отписки — её нужно вызвать при размонтировании
 * компонента, иначе подписка останется жить вместе с окном.
 */
export async function subscribeEvent<T = unknown>(
  topic: string,
  handler: (payload: T) => void,
): Promise<UnlistenFn> {
  return listen<T>(topic, (event) => handler(event.payload));
}

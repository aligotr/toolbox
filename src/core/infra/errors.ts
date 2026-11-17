// Текст отказа для журнала и подписей.
//
// Отказ Tauri приходит двумя способами: строкой или структурой
// `{code, params, fallback}` (ADR 0039). Код переводится словарём, а русский
// `fallback` остаётся, когда перевода кода ещё нет: пустая строка выглядела
// бы не пропуском, а поломкой интерфейса.

import type { AppError } from "@/contracts/errors";
import { hasMessage, t } from "./i18n/index.ts";

/** Распознаёт структурный отказ среди того, что пришло из Tauri. */
export function asAppError(error: unknown): AppError | null {
  if (typeof error !== "object" || error === null) return null;

  const value = error as Partial<AppError>;
  if (typeof value.code !== "string" || typeof value.fallback !== "string") {
    return null;
  }
  const params: Record<string, string> = {};
  for (const [name, param] of Object.entries(value.params ?? {})) {
    params[name] = String(param);
  }
  return { code: value.code, params, fallback: value.fallback };
}

/**
 * Приводит отказ к структуре.
 *
 * Строка не несёт кода, поэтому становится запасным текстом без перевода:
 * так замечание можно хранить одинаково и показать через `describeError`.
 */
export function appErrorOf(error: unknown): AppError {
  const coded = asAppError(error);
  if (coded) return coded;

  const text = error instanceof Error ? error.message : String(error);
  return { code: "errors.core.unexpected", params: { reason: text }, fallback: text };
}

/** Текст ошибки: структурный отказ переводится, остальное — как есть. */
export function describeError(error: unknown): string {
  const coded = asAppError(error) ?? appErrorOf(error);
  return hasMessage(coded.code) ? t(coded.code, coded.params) : coded.fallback;
}

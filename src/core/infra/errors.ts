// Текст отказа для журнала и подписей.
//
// Отказ Tauri приходит двумя способами: строкой или структурой
// `{code, params, fallback}` (ADR 0039). Код переводится словарём, а русский
// `fallback` остаётся, когда перевода кода ещё нет: пустая строка выглядела
// бы не пропуском, а поломкой интерфейса.

import type { AppError } from "@/contracts/errors";
import { hasMessage, t } from "./i18n/index.ts";

/** Распознаёт структурный отказ среди того, что пришло из Tauri. */
function asCodedError(error: unknown): AppError | null {
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

/** Текст ошибки: исключение отдаёт сообщение, строка остаётся собой. */
export function describeError(error: unknown): string {
  const coded = asCodedError(error);
  if (coded) {
    return hasMessage(coded.code) ? t(coded.code, coded.params) : coded.fallback;
  }
  return error instanceof Error ? error.message : String(error);
}

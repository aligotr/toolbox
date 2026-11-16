// Обёртка одной асинхронной операции: загрузка, ошибка и результат.
//
// Состояние гранулярное: у каждого действия свой объект, поэтому отказ одной
// операции не гасит кнопку другой. Ошибка не глотается — она остаётся в
// `status.error`, а действие само решает, что записать в журнал: обёртка не
// знает ни имени инструмента, ни смысла отказа.
//
// Повторный запуск во время работы игнорируется: двойной клик не создаёт
// второй запрос. Действие возвращает результат, обёртка отдаёт его наружу;
// `null` означает «операция не выполнена» — отказ или повторный запуск.

import { reactive } from "vue";
import { describeError } from "./errors";
import { idle, type OperationStatus } from "./status";

/** Одна операция: состояние и запуск. */
export interface AsyncAction<TArgs extends unknown[] = [], TResult = void> {
  status: OperationStatus;
  run: (...args: TArgs) => Promise<TResult | null>;
}

/**
 * Обёртка операции.
 *
 * Действие получает те же аргументы, что и `run`, и сообщает об отказе
 * исключением — обёртка переводит его в текст для панели.
 */
export function useAsyncAction<TArgs extends unknown[], TResult = void>(
  action: (...args: TArgs) => Promise<TResult>,
): AsyncAction<TArgs, TResult> {
  const status = reactive<OperationStatus>(idle());

  async function run(...args: TArgs): Promise<TResult | null> {
    if (status.loading) return null;

    status.loading = true;
    status.error = null;

    try {
      return await action(...args);
    } catch (error) {
      status.error = describeError(error);
      return null;
    } finally {
      status.loading = false;
    }
  }

  return { status, run };
}

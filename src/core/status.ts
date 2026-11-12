// Состояние операции: загрузка и ошибка.
//
// Одна форма на все сервисы оболочки. Копия в каждом файле рано или поздно
// разошлась бы полями, и панель одного раздела перестала бы показывать отказ.

/** Состояние одной операции. */
export interface OperationStatus {
  loading: boolean;
  error: string | null;
}

/** Свежее состояние операции: ничего не идёт, ошибки нет. */
export function idle(): OperationStatus {
  return { loading: false, error: null };
}

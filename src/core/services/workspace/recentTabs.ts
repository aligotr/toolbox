// Память активаций вкладок: порядок свежести в текущем сеансе.
//
// Обычный выбор многовариантного инструмента ведёт в последнюю активную
// вкладку с ним (ADR 0042). В файл история не пишется: рабочее пространство
// хранит активную вкладку, а порядок возврата — состояние сеанса.
//
// Список живёт отдельно от `workspace`: он не участвует в сохранении
// и не должен попадать в реактивный снимок файла.

/** Идентификаторы вкладок по свежести, свежие впереди. */
const recent: string[] = [];

/** Отмечает вкладку свежей в памяти активаций. */
export function rememberTab(id: string): void {
  const index = recent.indexOf(id);
  if (index >= 0) recent.splice(index, 1);
  recent.unshift(id);
}

/** Забывает закрытую вкладку. */
export function forgetTab(id: string): void {
  const index = recent.indexOf(id);
  if (index >= 0) recent.splice(index, 1);
}

/** Переносит память на новый идентификатор перезапущенной вкладки. */
export function renameTab(from: string, to: string): void {
  const index = recent.indexOf(from);
  if (index >= 0) recent.splice(index, 1, to);
}

/** Начинает историю заново: после перезапуска помним только активную. */
export function resetRecentTabs(): void {
  recent.length = 0;
}

/** Идентификаторы по свежести: вызывающий берёт первый подходящий. */
export function recentTabIds(): readonly string[] {
  return recent;
}

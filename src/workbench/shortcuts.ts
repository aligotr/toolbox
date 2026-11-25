// Горячие клавиши оболочки.
//
// Обработчик один: клавиши меняют состояние всей оболочки, а не отдельной
// панели. Сравнение идёт по `event.code`, поэтому латинская раскладка
// не требуется: `event.key` зависит от раскладки, `event.code` - нет.
//
// Ctrl+B сворачивает и разворачивает сайдбар.
// Ctrl+W закрывает активную вкладку по тем же правилам, что и крестик:
// последняя вкладка заменяется пустой, соседняя справа становится активной.

import { closeTab, workspace } from "@/core/services/workspace/index";

/**
 * Закрывает активную вкладку.
 *
 * Пустое пространство без активной вкладки - не ошибка: закрывать нечего,
 * и новая вкладка не появляется.
 */
export function closeActiveTab(): void {
  if (workspace.activeId) closeTab(workspace.activeId);
}

/**
 * Разбирает горячую клавишу оболочки.
 *
 * Alt, Shift и автоповтор отсекаются: иначе сочетание с модификатором или
 * удержание клавиши закрывало бы вкладки подряд. `preventDefault` нужен,
 * чтобы действие не ушло браузерному движку окна.
 */
export function handleWorkbenchKeydown(event: KeyboardEvent, toggleSidebar: () => void): void {
  if (event.repeat || !event.ctrlKey || event.altKey || event.shiftKey) return;

  if (event.code === "KeyB") {
    event.preventDefault();
    toggleSidebar();
    return;
  }

  if (event.code === "KeyW") {
    event.preventDefault();
    closeActiveTab();
  }
}

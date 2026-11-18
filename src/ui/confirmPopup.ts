// Всплывающее подтверждение: общие опции и стрелка по центру цели.
//
// PrimeVue наводит стрелку на левый край кнопки: у широкой кнопки стрелка
// уходит к краю, а не к центру. Здесь стрелка переносится в центр, а опции
// подтверждения собираются в одном месте, чтобы журнал и инструменты
// не расходились.

import type { ConfirmationOptions } from "primevue/confirmationoptions";
import { useConfirm } from "primevue/useconfirm";
import { CONFIRM_CALM_REJECT, CONFIRM_DANGER_ACCEPT } from "@/core/constants";

/** Подтверждение действия: цель, тексты и обработчик согласия. */
export interface ConfirmRequest {
  target: HTMLElement;
  message: string;
  acceptLabel: string;
  rejectLabel: string;
  accept: () => void;
}

/** Спрашивает подтверждение всплывающим блоком у кнопки. */
export function requireConfirm(
  confirm: ReturnType<typeof useConfirm>,
  request: ConfirmRequest,
): void {
  confirm.require({
    group: "popup",
    target: request.target,
    message: request.message,
    acceptLabel: request.acceptLabel,
    rejectLabel: request.rejectLabel,
    acceptProps: CONFIRM_DANGER_ACCEPT,
    rejectProps: CONFIRM_CALM_REJECT,
    accept: request.accept,
  } satisfies ConfirmationOptions);

  centerArrow(request.target);
}

/**
 * Ждёт появления блока и ставит стрелку на центр кнопки.
 *
 * Положение стрелки читается из живых стилей, а переменная сдвигается
 * на разницу с центром кнопки. Кнопка у края окна заставляет PrimeVue
 * пересчитывать блок уже после показа, поэтому поправка повторяется
 * несколько кадров подряд, пока стрелка не встанет на место.
 */
function centerArrow(target: HTMLElement): void {
  let tries = 0;
  let settled = 0;

  const align = (): void => {
    tries += 1;
    const popup = document.querySelector<HTMLElement>(".p-confirmpopup");
    const popupRect = popup?.getBoundingClientRect();

    if (popup && popupRect && popupRect.width > 0) {
      const targetRect = target.getBoundingClientRect();
      const wanted = targetRect.left + targetRect.width / 2 - popupRect.left;
      const delta = wanted - arrowCenter(popup);

      if (Math.abs(delta) < 0.5) {
        settled += 1;
      } else {
        settled = 0;
        const current = stylePixels(popup.style.getPropertyValue("--p-confirmpopup-arrow-left"));
        popup.style.setProperty("--p-confirmpopup-arrow-left", `${current + delta}px`);
      }
    }

    if (settled < 2 && tries < 30) {
      requestAnimationFrame(align);
    }
  };

  requestAnimationFrame(align);
}

/** Центр стрелки относительно левого края блока. */
function arrowCenter(popup: HTMLElement): number {
  const arrow = getComputedStyle(popup, "::before");
  return stylePixels(arrow.left) + stylePixels(arrow.marginLeft) + stylePixels(arrow.width) / 2;
}

/** Число из значения стиля: пустое или нечисловое даёт ноль. */
function stylePixels(value: string): number {
  return Number.parseFloat(value) || 0;
}

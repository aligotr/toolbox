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

  alignPopup(request.target);
}

/** Зазор между кнопкой и блоком подтверждения. */
const POPUP_GAP = 8;

/**
 * Ждёт появления блока, ставит его под кнопкой и наводит стрелку на центр.
 *
 * PrimeVue 4.5.5 не выравнивает блок при показе, и он остаётся в углу окна.
 * Поэтому положение считается здесь. Стрелка читается из живых стилей,
 * а переменная сдвигается на разницу с центром кнопки. У края окна блок
 * пересчитывается уже после показа, поэтому поправка повторяется несколько
 * кадров подряд, пока стрелка не встанет на место.
 */
function alignPopup(target: HTMLElement): void {
  let tries = 0;
  let settled = 0;

  const align = (): void => {
    tries += 1;
    const popup = document.querySelector<HTMLElement>(".p-confirmpopup");

    if (popup && popup.offsetWidth > 0) {
      placePopup(popup, target);
      const popupRect = popup.getBoundingClientRect();
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

/**
 * Ставит блок под кнопкой, а у края окна прижимает его внутрь.
 *
 * `top` и `left` считаются в координатах документа: блок лежит в `body`
 * и позиционируется абсолютно.
 */
function placePopup(popup: HTMLElement, target: HTMLElement): void {
  const rect = target.getBoundingClientRect();
  const width = popup.offsetWidth;
  const height = popup.offsetHeight;
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;

  let top = rect.bottom + POPUP_GAP;
  if (top + height > viewportHeight) top = Math.max(POPUP_GAP, rect.top - height - POPUP_GAP);

  let left = rect.left;
  if (left + width > viewportWidth) left = Math.max(POPUP_GAP, rect.right - width);

  popup.style.removeProperty("inset-inline-start");
  popup.style.removeProperty("inset-inline-end");
  popup.style.top = `${top + window.scrollY}px`;
  popup.style.left = `${left + window.scrollX}px`;

  const flipped = top < rect.top;
  popup.toggleAttribute("data-p-confirmpopup-flipped", flipped);
  popup.classList.toggle("p-confirmpopup-flipped", flipped);
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

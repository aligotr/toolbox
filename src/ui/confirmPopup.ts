// Всплывающее подтверждение: общие опции и стрелка по центру цели.
//
// Опции подтверждения собираются в одном месте, чтобы журнал, инструменты
// и настройки не расходились. Положение блока и стрелку ведёт общий механизм
// `anchoredOverlay`: подтверждения зовут `requireConfirm` и о геометрии
// не думают.

import type { ConfirmationOptions } from "primevue/confirmationoptions";
import { useConfirm } from "primevue/useconfirm";
import { CONFIRM_CALM_REJECT, CONFIRM_DANGER_ACCEPT } from "@/core/constants";
import { anchorOverlay } from "./anchoredOverlay";

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

  anchorOverlay(request.target);
}

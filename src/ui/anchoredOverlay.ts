// Всплывающий блок у кнопки: положение и стрелка на центр цели.
//
// PrimeVue ставит стрелку на фиксированный отступ от края блока, а ConfirmPopup
// версии 4.5.5 ещё и не позиционирует себя при показе. Здесь общий механизм:
// вызывающий отдаёт кнопку, помощник сам находит блок, ставит его, если надо,
// и наводит стрелку на центр. Подтверждения и всплывающие формы зовут его
// и не думают про геометрию.

/** Зазор между кнопкой и всплывающим блоком. */
const GAP = 8;

/** Переменная стрелки: у подтверждения и панели она своя. */
function arrowVariable(popup: HTMLElement): string {
  return popup.classList.contains("p-confirmpopup")
    ? "--p-confirmpopup-arrow-left"
    : "--p-popover-arrow-offset";
}

/**
 * Приводит всплывающий блок у кнопки в порядок.
 *
 * Ждёт появления блока, у подтверждения ставит его сам, затем наводит стрелку
 * на центр кнопки. Поправка повторяется, пока стрелка не устоится: блок у края
 * окна пересчитывается уже после показа.
 */
export function anchorOverlay(target: HTMLElement): void {
  let tries = 0;
  let settled = 0;

  const align = (): void => {
    tries += 1;
    const popup = document.querySelector<HTMLElement>(".p-confirmpopup, .p-popover");

    if (popup && popup.offsetWidth > 0) {
      if (popup.classList.contains("p-confirmpopup")) placeBelow(popup, target);
      settled = nudgeArrow(popup, target) ? settled + 1 : 0;
    }

    if (settled < 2 && tries < 30) {
      requestAnimationFrame(align);
    }
  };

  requestAnimationFrame(align);
}

/** Сдвигает стрелку к центру кнопки; `true` - уже на месте. */
function nudgeArrow(popup: HTMLElement, target: HTMLElement): boolean {
  const popupRect = popup.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const wanted = targetRect.left + targetRect.width / 2 - popupRect.left;
  const delta = wanted - arrowCenter(popup);

  if (Math.abs(delta) < 0.5) return true;

  const variable = arrowVariable(popup);
  const current = stylePixels(popup.style.getPropertyValue(variable));
  popup.style.setProperty(variable, `${current + delta}px`);
  return false;
}

/**
 * Ставит блок под кнопкой по центру, а у края окна прижимает внутрь.
 *
 * Центр по кнопке держит стрелку в середине блока: у края окна блок
 * сдвигается внутрь, и стрелка уходит от края. `top` и `left` считаются
 * в координатах документа: блок лежит в `body` и позиционируется абсолютно.
 */
function placeBelow(popup: HTMLElement, target: HTMLElement): void {
  const rect = target.getBoundingClientRect();
  const width = popup.offsetWidth;
  const height = popup.offsetHeight;
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;

  let top = rect.bottom + GAP;
  if (top + height > viewportHeight) top = Math.max(GAP, rect.top - height - GAP);

  let left = rect.left + rect.width / 2 - width / 2;
  left = Math.min(left, viewportWidth - width - GAP);
  left = Math.max(GAP, left);

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

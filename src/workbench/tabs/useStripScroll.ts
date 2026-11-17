// Прокрутка полосы вкладок: шевроны у кромок и видимая зона активной вкладки.
//
// Скроллбар полосы скрыт, поэтому шевроны — единственная видимая навигация:
// они появляются только в ту сторону, где остались скрытые вкладки, и шагают
// почти на экран. Активная вкладка подкручивается с запасом на шеврон:
// `scrollIntoView` считает кромку под стрелкой видимой и оставляет заголовок
// обрезанным (ADR 0043, ADR 0045).
//
// Список и активная вкладка приходят снаружи: композабл знает геометрию
// полосы, но не разметку вкладки.

import { nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from "vue";
import { focusTick, workspace } from "@/core/services/workspace/index";

/** Допуск в пикселях: дробная прокрутка не должна гасить шеврон раньше времени. */
const SCROLL_EPSILON = 1;

/** Доля ширины полосы, на которую сдвигает клик по шеврону. */
const SCROLL_PAGE = 0.8;

/** Ширина кромки, которую шеврон и градиент перекрывают у вкладок. */
const CHEVRON_REACH = 44;

export function useStripScroll(
  listEl: Ref<HTMLElement | null>,
  activeTab: () => HTMLElement | null,
) {
  /** Есть ли скрытые вкладки слева и справа. */
  const canScrollLeft = ref(false);
  const canScrollRight = ref(false);

  /** Пересчитывает доступность шевронов по текущей прокрутке. */
  function updateScrollState(): void {
    const el = listEl.value;
    if (!el) return;
    canScrollLeft.value = el.scrollLeft > SCROLL_EPSILON;
    canScrollRight.value =
      el.scrollLeft + el.clientWidth < el.scrollWidth - SCROLL_EPSILON;
  }

  /** Сдвигает полосу почти на экран в заданную сторону. */
  function scrollTabs(direction: -1 | 1): void {
    const el = listEl.value;
    if (!el) return;
    el.scrollBy({
      left: direction * el.clientWidth * SCROLL_PAGE,
      behavior: "smooth",
    });
  }

  /**
   * Подкручивает полосу так, чтобы активная вкладка была видна целиком.
   *
   * Целимся в кромку с запасом на шеврон, а не в край полосы: вкладка у кромки
   * формально в прокрутке, но её заголовок прячется под стрелкой.
   */
  function revealActiveTab(behavior: ScrollBehavior = "smooth"): void {
    const el = listEl.value;
    const tab = activeTab();
    if (!el || !tab || el.clientWidth === 0) return;

    // Положение вкладки в координатах содержимого полосы.
    const listRect = el.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    const start = tabRect.left - listRect.left + el.scrollLeft;
    const end = start + tabRect.width;
    const max = Math.max(el.scrollWidth - el.clientWidth, 0);

    // Вкладка шире видимой зоны: показываем хотя бы её начало.
    const room = Math.max(el.clientWidth - CHEVRON_REACH * 2, 1);
    const fits = end - start <= room;

    let target = el.scrollLeft;
    if (!fits || start - CHEVRON_REACH < el.scrollLeft) {
      target = start - CHEVRON_REACH;
    } else if (end + CHEVRON_REACH > el.scrollLeft + el.clientWidth) {
      target = end + CHEVRON_REACH - el.clientWidth;
    }

    target = Math.min(Math.max(target, 0), max);
    if (Math.abs(target - el.scrollLeft) < SCROLL_EPSILON) return;
    el.scrollTo({ left: target, behavior });
  }

  /** Ширина полосы меняется от окна и сайдбара, а не только от прокрутки. */
  let listResize: ResizeObserver | null = null;

  onMounted(async () => {
    updateScrollState();
    if (!listEl.value) return;
    listResize = new ResizeObserver(() => updateScrollState());
    listResize.observe(listEl.value);

    // Восстановленное рабочее место могло оставить активную вкладку за кромкой.
    await nextTick();
    revealActiveTab("auto");
  });

  onBeforeUnmount(() => {
    listResize?.disconnect();
    listResize = null;
  });

  // Число вкладок меняет ширину содержимого, но не ширину самой полосы.
  watch(
    () => workspace.tabs.length,
    async () => {
      await nextTick();
      updateScrollState();
    },
  );

  // Активная вкладка не должна оставаться за кромкой: иначе выбор инструмента
  // в сайдбаре выглядел бы как «ничего не произошло». Сигнал срабатывает и на
  // повторный выбор уже активной вкладки.
  watch(focusTick, async () => {
    await nextTick();
    revealActiveTab();
  });

  return { canScrollLeft, canScrollRight, scrollTabs, updateScrollState };
}

// Постоянные подписи и числа оболочки.
//
// Здесь только то, что принадлежит оболочке и не имеет своего домена:
// названия одиночных вкладок, заготовка пустой вкладки и договор кнопок
// подтверждения. Заголовки и иконки нужны и core (он создаёт вкладку),
// и workbench (он рисует пункт сайдбара): держать их в одном месте дешевле,
// чем повторять строки в двух слоях и расходиться при переименовании.
//
// Константы домена живут рядом с его правилами: настройки — в
// `services/settings/constants.ts`, пресеты — в `services/presets/constants.ts`,
// вкладки — в `services/workspace/constants.ts`, журнал — в
// `infra/constants.ts`.

import type { SingletonKind } from "@/contracts/workspace";

/** Метаданные одиночной вкладки. */
export interface SingletonTabMeta {
  title: string;
  icon: string;
}

/** Журнал и настройки: их открывает сайдбар, а полоса вкладок показывает наравне с рабочими. */
export const SINGLETON_TABS: Record<SingletonKind, SingletonTabMeta> = {
  journal: { title: "Журнал", icon: "pi pi-history" },
  settings: { title: "Настройки", icon: "pi pi-cog" },
};

/** Заголовок вкладки, которая ещё не занята инструментом. */
export const EMPTY_TAB_TITLE = "Новая вкладка";

/** Иконка пустой вкладки: та же, что у кнопки «плюс» в полосе вкладок. */
export const EMPTY_TAB_ICON = "pi pi-th-large";

/**
 * Кнопки подтверждений: один договор на всё приложение.
 *
 * Опасное действие — удаление, очистка — отвечает красной кнопкой:
 * `danger` в PrimeVue и есть цвет ошибки. Отказ спокойный, без акцентной
 * заливки, чтобы цвет главного ответа не спорил с ним.
 */
export const CONFIRM_DANGER_ACCEPT = { severity: "danger" } as const;
export const CONFIRM_CALM_REJECT = { severity: "secondary", text: true } as const;

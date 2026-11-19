// Постоянные подписи и числа оболочки.
//
// Здесь только то, что принадлежит оболочке и не имеет своего домена:
// названия одиночных вкладок и договор кнопок подтверждения. Подписи
// хранятся ключами словаря: текст берётся при показе, поэтому смена языка
// не требует перезапуска (ADR 0039). Иконки нужны и core (он создаёт
// вкладку), и workbench (он рисует пункт сайдбара).
//
// Константы домена живут рядом с его правилами: настройки — в
// `services/settings/constants.ts`, пресеты — в `services/presets/constants.ts`,
// вкладки — в `services/workspace/constants.ts`, журнал — в
// `infra/constants.ts`.

import type { SingletonKind } from "@/contracts/workspace";

/** Метаданные одиночной вкладки. */
export interface SingletonTabMeta {
  /** Ключ подписи в словаре. */
  titleKey: string;
  icon: string;
}

/** Журнал и настройки: их открывает сайдбар, а полоса вкладок показывает наравне с рабочими. */
export const SINGLETON_TABS: Record<SingletonKind, SingletonTabMeta> = {
  journal: { titleKey: "tab.journal.title", icon: "pi pi-history" },
  settings: { titleKey: "tab.settings.title", icon: "pi pi-cog" },
};

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

/**
 * Главный ответ неопасного подтверждения: цвет действия по умолчанию.
 *
 * Нужен там, где ответ остаётся главным, но потери данных нет: сброс
 * положения окна, переключение без удаления.
 */
export const CONFIRM_PRIMARY_ACCEPT = {} as const;

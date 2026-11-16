// Постоянные подписи и числа оболочки.
//
// Заголовки и иконки нужны и core (он создаёт вкладку), и shell (он рисует
// пункт сайдбара). Держать их в одном месте дешевле, чем повторять строки
// в двух слоях и расходиться при переименовании.

import type { SingletonKind } from "../contracts/workspace";

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

/** Топик «настройки изменились»: нагрузка — `{ section }` (ADR 0010). */
export const SETTINGS_CHANGED_TOPIC = "core:settings:changed";

/** Заголовок вкладки, которая ещё не занята инструментом. */
export const EMPTY_TAB_TITLE = "Новая вкладка";

/** Иконка пустой вкладки: та же, что у кнопки «плюс» в полосе вкладок. */
export const EMPTY_TAB_ICON = "pi pi-th-large";

/**
 * Иконка вкладки, собранной из шаблона.
 *
 * Одна на все шаблоны: содержимое у них разное, а происхождение — общее,
 * и различать шаблоны по иконке всё равно пришлось бы угадывать.
 */
export const TEMPLATE_TAB_ICON = "pi pi-clone";

/** Источник записей журнала, которые сделало ядро интерфейса. */
export const JOURNAL_CORE_SOURCE = "ядро";

/** Предел длины названия пресета: тот же, что проверяет ядро. */
export const PRESET_TITLE_MAX_LENGTH = 60;

/** Версия формата `local/workspace.json`. */
export const WORKSPACE_VERSION = 1;

/**
 * Задержка записи рабочего пространства после последнего изменения.
 *
 * Перетаскивание границы колонки меняет ширину десятки раз в секунду.
 * Писать файл на каждое движение — значит нагружать диск и синхронизацию
 * ради промежуточных значений, которые пользователь тут же сменит.
 */
export const WORKSPACE_SAVE_DELAY_MS = 300;

/**
 * Предел ожидания записи при закрытии окна.
 *
 * Окно обязано закрыться даже если папка программы на сетевой шаре
 * и запись зависла. Потеря последней правки дешевле незакрывающегося окна.
 */
export const WORKSPACE_CLOSE_TIMEOUT_MS = 3000;

/**
 * Кнопки подтверждений: один договор на всё приложение.
 *
 * Опасное действие — удаление, очистка — отвечает красной кнопкой:
 * `danger` в PrimeVue и есть цвет ошибки. Отказ спокойный, без акцентной
 * заливки, чтобы цвет главного ответа не спорил с ним.
 */
export const CONFIRM_DANGER_ACCEPT = { severity: "danger" } as const;
export const CONFIRM_CALM_REJECT = { severity: "secondary", text: true } as const;

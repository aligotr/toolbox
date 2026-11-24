// Константы инструмента Ping.
//
// Пределы и умолчания совпадают со спекой и проверкой Rust: интерфейс
// не придумывает свои значения, иначе таблица и ядро разойдутся в терминах.
// Магических чисел и строк в компонентах нет - всё именовано здесь.
// Подписи, которые видит пользователь, читаются из словаря при обращении
// (ADR 0039); проводные значения статусов остаются кодами протокола.

import { t } from "@/core/infra/i18n";
import type { Family, FamilyFilter, StatusFilter } from "./types";

/** Пределы подсистемы: те же, что проверяет Rust. */
export const MAX_TARGETS = 64;
export const MAX_ADDRESSES = 128;
export const MIN_PERIOD_MS = 200;
export const MAX_PERIOD_MS = 60000;
export const DEFAULT_PERIOD_MS = 1000;
export const MIN_COUNT = 1;
export const MAX_COUNT = 100;
export const DEFAULT_COUNT = 4;

/** Проводное значение «без ограничения» в поле количества. */
export const ENDLESS_COUNT = 0;

/** Сколько последних пакетов адреса остаётся в таблице. */
export const KEPT_PACKETS = 10;
export const MIN_TIMEOUT_MS = 200;
export const MAX_TIMEOUT_MS = 10000;
export const DEFAULT_TIMEOUT_MS = 1000;

/** Имя инструмента: сайдбар, вкладка и заголовок экрана. */
export const TOOL_TITLE = "Ping";

/** Ключ сеанса, если оболочка не передала `cellKey` (одиночный запуск). */
export const STANDALONE_CELL_KEY = "icmp:standalone";

/** Источник записей инструмента в журнале. */
export const JOURNAL_SOURCE = "icmp";

/** Идентификатор инструмента в файлах пресетов: `presets/icmp/`. */
export const PRESET_TOOL = "icmp";

/** Сколько подсвечивается найденный дубликат. */
export const HIGHLIGHT_MS = 2400;

/** Ширина колонки цели: длинное имя обрезается, а не тянет таблицу. */
export const TARGET_COLUMN_MIN_WIDTH = "240px";
export const TARGET_COLUMN_MAX_WIDTH = "380px";

/** Ширины числовых колонок: пара пакетов, задержка и статус не сжимаются. */
export const PACKET_COLUMN_MIN_WIDTH = "112px";
export const LATENCY_COLUMN_MIN_WIDTH = "96px";
export const STATUS_COLUMN_MIN_WIDTH = "132px";

/** Семейства в порядке меню. */
export const FAMILIES: Family[] = ["auto", "ipv4", "ipv6"];

/** Семейство новой цели по умолчанию. */
export const DEFAULT_FAMILY: Family = "auto";

/** Подписи семейств для поля добавления. */
export function familyOptions(): { label: string; value: Family }[] {
  return [
    { label: t("icmp.family.auto"), value: "auto" },
    { label: t("icmp.family.ipv4"), value: "ipv4" },
    { label: t("icmp.family.ipv6"), value: "ipv6" },
  ];
}

/** Варианты фильтра по статусу: подписи читаются при показе. */
export function statusFilterOptions(): { label: string; value: StatusFilter }[] {
  return [
    { label: t("icmp.filter.all"), value: "all" },
    { label: t("icmp.filter.ok"), value: "ok" },
    { label: t("icmp.filter.loss"), value: "loss" },
    { label: t("icmp.filter.failed"), value: "failed" },
  ];
}

/** Варианты фильтра по семейству. */
export function familyFilterOptions(): { label: string; value: FamilyFilter }[] {
  return [
    { label: t("icmp.filter.familyAll"), value: "all" },
    { label: t("icmp.family.ipv4"), value: "ipv4" },
    { label: t("icmp.family.ipv6"), value: "ipv6" },
  ];
}

/** Проверяет, что строка - известное семейство цели. */
export function isFamily(value: unknown): value is Family {
  return value === "auto" || value === "ipv4" || value === "ipv6";
}

/** Проверяет, что строка - известный фильтр статуса. */
export function isStatusFilter(value: unknown): value is StatusFilter {
  return value === "all" || value === "ok" || value === "loss" || value === "failed";
}

/** Проверяет, что строка - известный фильтр семейства. */
export function isFamilyFilter(value: unknown): value is FamilyFilter {
  return value === "all" || value === "ipv4" || value === "ipv6";
}

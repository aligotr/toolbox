// Константы инструмента DNS.
//
// Подписи фильтров и пределы совпадают со спекой и проверкой Rust: интерфейс
// не придумывает свои значения, иначе таблица и ядро разойдутся в терминах.
// Магических чисел и строк в компонентах нет — всё именовано здесь.
// Подписи, которые видит пользователь, читаются из словаря при обращении
// (ADR 0039); проводные значения статусов остаются кодами протокола.

import { t } from "@/core/infra/i18n";
import type { CellStatus, RecordType, ServerOption, StatusFilter } from "./types";

/** Типы записей в порядке меню. */
export const RECORD_TYPES: RecordType[] = [
  "A",
  "AAAA",
  "CNAME",
  "MX",
  "TXT",
  "NS",
  "SOA",
  "SRV",
  "CAA",
  "PTR",
];

/** Тип новой строки по умолчанию. */
export const DEFAULT_RECORD_TYPE: RecordType = "A";

/** Пределы подсистемы: те же, что проверяет Rust. */
export const QUERY_LIMIT = 500;
export const SERVER_LIMIT = 8;

/** Сколько выбранных серверов показывается в поле списка: остальные — счётчиком «+N». */
export const SERVER_LABEL_LIMIT = 2;

/** Ключ сеанса, если оболочка не передала `cellKey` (одиночный запуск). */
export const STANDALONE_CELL_KEY = "dnslookup:standalone";

/** Идентификатор системного сервера: адреса берутся у ОС, а не из профиля. */
export const SYSTEM_SERVER_ID = "system";

/** Имя инструмента: сайдбар, вкладка и заголовок экрана. */
export const TOOL_TITLE = "DNSlookup";

/** Ширины колонок: закреплённые не сжимаются меньше, серверные — по имени. */
export const DOMAIN_COLUMN_MIN_WIDTH = "240px";
/** Потолок «Доменов»: длинное имя обрезается многоточием, а не тянет колонку. */
export const DOMAIN_COLUMN_MAX_WIDTH = "360px";
export const TYPE_COLUMN_MIN_WIDTH = "104px";
/** Поле типа записи: самый длинный тип CNAME влезает целиком вместе со стрелкой. */
export const TYPE_FIELD_WIDTH = "92px";
export const SERVER_COLUMN_MIN_WIDTH = "144px";

/** Ширина диалогов инструмента и потолок для узкого окна. */
export const DIALOG_WIDTH = "560px";
export const DIALOG_MAX_WIDTH = "92vw";

/** Сколько подсвечивается найденный дубликат. */
export const HIGHLIGHT_MS = 2400;

/** Источник записей инструмента в журнале. */
export const JOURNAL_SOURCE = "dnslookup";

/** Идентификатор инструмента в файлах пресетов: `presets/dnslookup/`. */
export const PRESET_TOOL = "dnslookup";

/** Преднастроенные серверы: в профиль не пишутся.
 *
 * Список собирается при обращении: подпись системного сервера берётся
 * из словаря и меняется вместе с языком (ADR 0039).
 */
export function presetServers(): ServerOption[] {
  return [
    {
      id: SYSTEM_SERVER_ID,
      label: t("dnslookup.servers.defaultLabel"),
      address: null,
      kind: "system",
    },
    { id: "yandex", label: "YandexDNS", address: "77.88.8.8", kind: "preset" },
    { id: "google", label: "Google", address: "8.8.8.8", kind: "preset" },
    { id: "cloudflare", label: "Cloudflare", address: "1.1.1.1", kind: "preset" },
    { id: "quad9", label: "Quad9", address: "9.9.9.9", kind: "preset" },
    { id: "adguard", label: "AdGuard", address: "94.140.14.14", kind: "preset" },
  ];
}

/** Серверы нового сеанса. */
export const DEFAULT_SERVER_IDS: string[] = [SYSTEM_SERVER_ID, "yandex"];

/** Статусы, которые считаются ошибкой для фильтра «есть ошибка». */
export const ERROR_STATUSES: CellStatus[] = [
  "servfail",
  "refused",
  "formerr",
  "notimp",
  "timeout",
  "offline",
  "bad_response",
];

/** Статусы «ответа нет» для фильтра «без ответа». */
export const EMPTY_STATUSES: CellStatus[] = ["nodata", "nxdomain"];

/** Варианты фильтра по статусу: подписи читаются из словаря при показе. */
export function statusFilterOptions(): { label: string; value: StatusFilter }[] {
  return [
    { label: t("dnslookup.filter.all"), value: "all" },
    { label: t("dnslookup.filter.error"), value: "error" },
    { label: t("dnslookup.filter.empty"), value: "empty" },
  ];
}

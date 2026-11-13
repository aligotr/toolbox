// Константы инструмента DNS.
//
// Подписи статусов и пределы совпадают со спекой и проверкой Rust: интерфейс
// не придумывает свои значения, иначе таблица и ядро разойдутся в терминах.
// Магических чисел и строк в компонентах нет — всё именовано здесь.

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
export const ATTEMPT_SECONDS = 3;

/** Сколько выбранных серверов показывается в поле списка: остальные — многоточием. */
export const SERVER_LABEL_LIMIT = 2;

/** Ключ сеанса, если оболочка не передала `cellKey` (одиночный запуск). */
export const STANDALONE_CELL_KEY = "dnslookup:standalone";

/** Идентификатор системного сервера: адреса берутся у ОС, а не из профиля. */
export const SYSTEM_SERVER_ID = "system";

/** Имя инструмента: сайдбар, вкладка и заголовок экрана. */
export const TOOL_TITLE = "DNSlookup";

/** Заголовок экрана: имя инструмента и краткое определение через дефис. */
export const TOOL_HEADING = `${TOOL_TITLE} - проверка и сравнение ответов DNS-серверов`;

/** Ширины колонок: закреплённые не сжимаются меньше, серверные — по имени. */
export const DOMAIN_COLUMN_MIN_WIDTH = "240px";
export const TYPE_COLUMN_MIN_WIDTH = "88px";
export const SERVER_COLUMN_MIN_WIDTH = "144px";

/** Ширина диалогов инструмента. */
export const DIALOG_WIDTH = "560px";

/** Сколько подсвечивается найденный дубликат. */
export const HIGHLIGHT_MS = 2400;

/** Источник записей инструмента в журнале. */
export const JOURNAL_SOURCE = "dnslookup";

/** Преднастроенные серверы: в профиль не пишутся. */
export const PRESET_SERVERS: ServerOption[] = [
  { id: SYSTEM_SERVER_ID, label: "Системный", address: null, kind: "system" },
  { id: "yandex", label: "YandexDNS", address: "77.88.8.8", kind: "preset" },
  { id: "google", label: "Google", address: "8.8.8.8", kind: "preset" },
  { id: "cloudflare", label: "Cloudflare", address: "1.1.1.1", kind: "preset" },
  { id: "quad9", label: "Quad9", address: "9.9.9.9", kind: "preset" },
  { id: "adguard", label: "AdGuard", address: "94.140.14.14", kind: "preset" },
];

/** Серверы нового сеанса. */
export const DEFAULT_SERVER_IDS: string[] = [SYSTEM_SERVER_ID, "yandex"];

/** Подписи статусов: проводное значение → текст в таблице. */
export const STATUS_LABELS: Record<CellStatus, string> = {
  pending: "—",
  ok: "OK",
  nodata: "NODATA",
  nxdomain: "NXDOMAIN",
  servfail: "SERVFAIL",
  refused: "REFUSED",
  formerr: "FORMERR",
  notimp: "NOTIMP",
  timeout: "TIMEOUT",
  offline: "НЕТ СЕТИ",
  bad_response: "ОШИБКА ОТВЕТА",
  cancelled: "—",
};

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

/** Варианты фильтра по статусу. */
export const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: "все", value: "all" },
  { label: "есть ошибка", value: "error" },
  { label: "без ответа", value: "empty" },
];

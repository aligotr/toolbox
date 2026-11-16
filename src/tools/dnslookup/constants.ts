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
export const TYPE_COLUMN_MIN_WIDTH = "88px";
export const SERVER_COLUMN_MIN_WIDTH = "144px";

/** Ширина диалогов инструмента и потолок для узкого окна. */
export const DIALOG_WIDTH = "560px";
export const DIALOG_MAX_WIDTH = "92vw";

/** Язык подписей времени: местный формат вместо UTC-строки из файла. */
export const DATE_LOCALE = "ru-RU";

/** Подпись времени, если файл сохранили без него или с ошибкой. */
export const UNKNOWN_SAVED_AT = "время не указано";

/** Сколько подсвечивается найденный дубликат. */
export const HIGHLIGHT_MS = 2400;

/** Источник записей инструмента в журнале. */
export const JOURNAL_SOURCE = "dnslookup";

/** Идентификатор инструмента в файлах пресетов: `presets/dnslookup/`. */
export const PRESET_TOOL = "dnslookup";

/** Действия с пресетом по умолчанию в списке пресетов. */
export const PRESET_DEFAULT_ACTION = "Сделать пресетом по умолчанию";
export const PRESET_DEFAULT_CLEAR = "Снять пресет по умолчанию";

/** Метка строки, которая грузится в новые вкладки. */
export const PRESET_DEFAULT_BADGE = "по умолчанию";

/** Причина отказа, если состояние операции не сохранило свою. */
export const PRESET_DEFAULT_ERROR = "Пресет по умолчанию не изменён.";

/** Подпись кнопки пресета, пока пресет не загружен: она открывает список. */
export const PRESET_BUTTON_EMPTY = "Пресеты";

/** Метка расхождения настроек с сохранённым пресетом. */
export const PRESET_CHANGED_LABEL = "Изменён";

/** Подсказки быстрых действий с пресетом в шапке экрана. */
export const PRESET_REVERT_HINT = "Отменить изменения";
export const PRESET_SAVE_HINT = "Сохранить в пресет";

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

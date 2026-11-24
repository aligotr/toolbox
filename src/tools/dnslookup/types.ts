// Типы инструмента DNS.
//
// Здесь два слоя: модель сеанса (строки, ячейки, фильтры) и формы протокола
// шины. Они похожи, но не совпадают: сеанс содержит интерфейсные статусы
// `pending`/`cancelled`, а события ядра — только проводные значения.
// Разделение не даёт интерфейсу «протечь» в контракт Rust и наоборот.

import type { AppError } from "@/contracts/errors";
import type { OperationStatus } from "@/core/infra/status";

/** Типы записей, которые поддерживает подсистема. */
export type RecordType =
  "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS" | "SOA" | "SRV" | "CAA" | "PTR";

/** Статус ячейки: проводные значения плюс два интерфейсных. */
export type CellStatus =
  | "pending"
  | "ok"
  | "nodata"
  | "nxdomain"
  | "servfail"
  | "refused"
  | "formerr"
  | "notimp"
  | "timeout"
  | "offline"
  | "bad_response"
  | "cancelled";

/** Фильтр по статусу: все строки, с ошибкой или без ответа. */
export type StatusFilter = "all" | "error" | "empty";

/** Одна строка таблицы — домен и тип. */
export interface DnsRow {
  /** Идентификатор строки; не меняется при повторных проверках. */
  id: string;
  /** Ввод пользователя без завершающей точки — так строка показывается. */
  input: string;
  /** Нормализованное имя для запроса или IP для PTR. */
  name: string;
  type: RecordType;
}

/** DNS-сервер: системный, преднастроенный или свой. */
export interface ServerOption {
  id: string;
  label: string;
  /** `null` — системный сервер: адреса берутся у ОС. */
  address: string | null;
  kind: "system" | "preset" | "custom";
}

/** Запись в ответе DNS в формате зоны. */
export interface DnsAnswer {
  value: string;
  ttl: number | null;
}

/** Предыдущий результат ячейки: показывается приглушённо во время проверки. */
export interface CellSnapshot {
  status: CellStatus;
  answers: DnsAnswer[];
  elapsedMs: number | null;
  error: string | null;
}

/** Результат одной ячейки «строка × сервер». */
export interface DnsCell {
  status: CellStatus;
  answers: DnsAnswer[];
  elapsedMs: number | null;
  error: string | null;
  /** Прошлый результат: нужен, чтобы не терять данные до прихода новых. */
  previous?: CellSnapshot;
}

/** Пара «сервер и его результат» для раскрытия строки. */
export interface CellDetailsEntry {
  server: ServerOption;
  cell: DnsCell | undefined;
}

/** Прогресс текущей проверки. */
export interface RunProgress {
  total: number;
  done: number;
}

/** Сеанс инструмента: живёт в модульной карте по `cellKey`. */
export interface DnsSession {
  rows: DnsRow[];
  /** Выбранные серверы: порядок задаёт порядок колонок. */
  servers: string[];
  /** Тип, который получают новые строки. */
  defaultType: RecordType;
  /** Результаты по ключу `${rowId}:${serverId}`. */
  cells: Map<string, DnsCell>;
  /** Свои серверы из профиля (заполняется диалогом). */
  customServers: ServerOption[];
  /** Файл своих серверов повреждён: запись запрещена до исправления. */
  serversBroken: boolean;
  /** Адреса системных резолверов, полученные от ОС. */
  systemAddresses: string[];
  /** Активная проверка; `null` — проверка не идёт. */
  runId: string | null;
  progress: RunProgress;
  status: {
    run: OperationStatus;
    /** Чтение системных резолверов и своих серверов. */
    servers: OperationStatus;
    /** Запись своих серверов в профиль. */
    serversSave: OperationStatus;
  };
  filters: {
    search: string;
    status: StatusFilter;
    diffOnly: boolean;
  };
  /** Скрытые серверные колонки: данные при этом остаются в сеансе. */
  hiddenServers: string[];
  /** Строка, которую нужно подсветить после дубликата. */
  highlightRowId: string | null;
  /** Пресет, из которого собран сеанс; `null` — сеанс ни с чем не связан. */
  presetId: string | null;
  /** Название связанного пресета: показывается в тулбаре и диалоге. */
  presetTitle: string | null;
  /**
   * Снимок настроек на момент загрузки или сохранения.
   *
   * По нему видно, изменён ли пресет: сравнивать с файлом на каждом
   * движении нельзя, а ревизия в файле усложнила бы конверт ради подписи.
   */
  presetSnapshot: string | null;
}

/** Настройки сеанса, которые сохраняет пресет. */
export interface DnsPresetPayload {
  /** Строки как есть: идентификаторы переживают загрузку. */
  rows: DnsRow[];
  /** Выбранные серверы: порядок задаёт порядок колонок. */
  servers: string[];
  /** Скрытые серверные колонки. */
  hiddenServers: string[];
  /** Фильтры таблицы: часть настройки задачи, а не разовый взгляд. */
  filters: {
    search: string;
    status: StatusFilter;
    diffOnly: boolean;
  };
}

/** Итог сравнения строки с ответом системного сервера. */
export interface RowVerdict {
  /** Хотя бы один сервер ответил иначе, чем системный. */
  differs: boolean;
}

/** Итог добавления строки. */
export type AddRowResult =
  | { kind: "added"; rowId: string }
  | { kind: "duplicate"; rowId: string }
  | { kind: "error"; message: string };

/** Один запрос проверки для ядра. */
export interface RunQuery {
  query_id: string;
  row_id: string;
  server_id: string;
  name: string;
  type: RecordType;
}

/** Сервер в запросе проверки; `address = null` — системный. */
export interface RunServer {
  id: string;
  address: string | null;
}

/** Запрос на проверку. */
export interface RunRequest {
  run_id: string;
  queries: RunQuery[];
  servers: RunServer[];
}

/** Ответ ядра на запуск проверки. */
export interface RunAccepted {
  run_id: string;
  accepted: boolean;
  query_count: number;
  error: AppError | null;
  correlation_id: string | null;
}

/** Событие результата одной ячейки. */
export interface DnsResultEvent {
  run_id: string;
  query_id: string;
  row_id: string;
  server_id: string;
  status: CellStatus;
  answers: DnsAnswer[];
  elapsed_ms: number | null;
  error: AppError | null;
}

/** Событие завершения проверки. */
export interface DnsFinishedEvent {
  run_id: string;
  completed: number;
  cancelled: boolean;
  elapsed_ms: number;
}

/** Ответ ядра со списком системных резолверов. */
export interface SystemServersReply {
  servers: string[];
  error: AppError | null;
}

// Состояние инструмента DNS.
//
// Карта сеансов живёт здесь, а не в компоненте: `ToolGrid` размонтирует
// инструмент при переключении вкладок, а строки и результаты должны
// пережить переключение (ADR 0017). Ключ сеанса — `cellKey`, поэтому два
// экземпляра DNS не смешивают данные.
//
// Подписки на события ядра тоже модульные: результат, полученный пока
// пользователь смотрел журнал, обязан попасть в сеанс. Состояния операций
// гранулярные: `status.run` и `status.servers` независимы (правило Vue).

import { computed, reactive, watch } from "vue";
import type { ToolCellProps } from "../../contracts/tools";
import { write } from "../../core/journal";
import { workspace } from "../../core/workspace";
import {
  cancelDns,
  loadCustomServers,
  loadSystemServers,
  onDnsFinished,
  onDnsResult,
  runDns,
  saveCustomServers,
  type StoredServer,
} from "./api";
import {
  DEFAULT_RECORD_TYPE,
  DEFAULT_SERVER_IDS,
  EMPTY_STATUSES,
  ERROR_STATUSES,
  HIGHLIGHT_MS,
  JOURNAL_SOURCE,
  PRESET_SERVERS,
  QUERY_LIMIT,
  SERVER_LIMIT,
  STANDALONE_CELL_KEY,
  STATUS_LABELS,
  SYSTEM_SERVER_ID,
} from "./constants";
import { parseAddressInput, parseServerAddress } from "./normalize";
import type {
  AddRowResult,
  CellSnapshot,
  DnsAnswer,
  DnsCell,
  DnsFinishedEvent,
  DnsResultEvent,
  DnsRow,
  DnsSession,
  RecordType,
  RowVerdict,
  RunQuery,
  ServerOption,
  StatusFilter,
} from "./types";

/** Сеансы по `cellKey`; переживают переключение вкладок. */
const sessions = new Map<string, DnsSession>();

/** Таймеры подсветки дубликатов: по сеансу, чтобы не плодить висящие. */
const highlightTimers = new WeakMap<DnsSession, ReturnType<typeof setTimeout>>();

/** Подписки создаются один раз на всё приложение. */
let subscriptions: Promise<void> | null = null;

/** Ключ результата «строка × сервер»; не путать с `cellKey` места в сетке. */
function resultKey(rowId: string, serverId: string): string {
  return `${rowId}:${serverId}`;
}

/** Все доступные серверы сеанса: преднастроенные и свои. */
function allServers(session: DnsSession): ServerOption[] {
  return [...PRESET_SERVERS, ...session.customServers];
}

/** Создаёт пустой сеанс с серверами и типом по умолчанию. */
function createSession(): DnsSession {
  return reactive({
    rows: [],
    servers: [...DEFAULT_SERVER_IDS],
    defaultType: DEFAULT_RECORD_TYPE,
    cells: new Map<string, DnsCell>(),
    customServers: [],
    systemAddresses: [],
    // Битый файл своих серверов: чтение вернуло ошибку, запись запрещена,
    // пока файл не исправят или не удалят.
    serversBroken: false,
    runId: null,
    progress: { total: 0, done: 0 },
    status: {
      run: { loading: false, error: null },
      servers: { loading: false, error: null },
    },
    filters: { search: "", status: "all" as StatusFilter, diffOnly: false },
    hiddenServers: [],
    highlightRowId: null,
  });
}

/** Убирает сеансы вкладок, которых больше нет в рабочем пространстве. */
function pruneSessions(): void {
  const openTabs = new Set(workspace.tabs.map((tab) => tab.id));
  if (openTabs.size === 0) return;

  for (const key of [...sessions.keys()]) {
    const parts = key.split(":");
    // Ключ без трёх частей — не место в сетке (например, одиночный запуск).
    if (parts.length < 3 || openTabs.has(parts[0])) continue;
    sessions.delete(key);
  }
}

/** Возвращает сеанс места в сетке, создавая его при первом обращении. */
function sessionFor(key: string): DnsSession {
  const existing = sessions.get(key);
  if (existing) return existing;

  const session = createSession();
  sessions.set(key, session);
  void refreshServers(session);
  return session;
}

/**
 * Читает системные резолверы и свои серверы.
 *
 * Две операции независимы, поэтому идут параллельно: ошибка чтения файла
 * не должна скрывать адреса, полученные от ОС. Ошибки собираются в одну
 * строку — пользователю важны обе причины.
 */
async function refreshServers(session: DnsSession): Promise<void> {
  if (session.status.servers.loading) return;
  session.status.servers.loading = true;
  session.status.servers.error = null;

  const errors: string[] = [];
  const [system, custom] = await Promise.allSettled([
    loadSystemServers(),
    loadCustomServers(),
  ]);

  if (system.status === "fulfilled") {
    session.systemAddresses = system.value.servers;
    if (system.value.error) errors.push(system.value.error);
  } else {
    errors.push(`системные резолверы: ${String(system.reason)}`);
  }

  if (custom.status === "fulfilled") {
    session.serversBroken = custom.value.error !== null;
    if (custom.value.error) {
      errors.push(custom.value.error);
    } else {
      session.customServers = custom.value.servers.map((server) => ({
        ...server,
        kind: "custom" as const,
      }));
    }
  } else {
    session.serversBroken = false;
    errors.push(`свои серверы: ${String(custom.reason)}`);
  }

  session.status.servers.error = errors.length > 0 ? errors.join("; ") : null;
  if (session.status.servers.error) {
    write(JOURNAL_SOURCE, "error", session.status.servers.error);
  }
  session.status.servers.loading = false;
}

/** Сохраняет свои серверы; возвращает текст ошибки или `null`. */
async function persistServers(
  session: DnsSession,
  servers: ServerOption[],
): Promise<string | null> {
  if (session.serversBroken) {
    // Запись поверх испорченного файла потеряла бы то, что ещё можно
    // восстановить руками: сначала пользователь чинит или удаляет файл.
    const text =
      "Файл своих серверов повреждён: запись запрещена до исправления или удаления";
    session.status.servers.error = text;
    write(JOURNAL_SOURCE, "error", text);
    return text;
  }

  session.status.servers.loading = true;
  session.status.servers.error = null;

  const payload: StoredServer[] = servers.map((server) => ({
    id: server.id,
    label: server.label,
    address: server.address ?? "",
  }));

  try {
    const reply = await saveCustomServers(payload);
    if (!reply.saved || reply.error) {
      const text = reply.error ?? "Не удалось сохранить свои серверы";
      session.status.servers.error = text;
      write(JOURNAL_SOURCE, "error", text);
      return text;
    }
    return null;
  } catch (error) {
    const text = `Не удалось сохранить свои серверы: ${String(error)}`;
    session.status.servers.error = text;
    write(JOURNAL_SOURCE, "error", text);
    return text;
  } finally {
    session.status.servers.loading = false;
  }
}

/** Добавляет свой сервер: сохраняет, затем выбирает его в сеансе. */
async function addCustomServer(
  session: DnsSession,
  label: string,
  address: string,
): Promise<string | null> {
  const server: ServerOption = {
    id: crypto.randomUUID(),
    label,
    address,
    kind: "custom",
  };

  const error = await persistServers(session, [
    ...session.customServers,
    server,
  ]);
  if (error) return error;

  session.customServers = [...session.customServers, server];
  if (
    session.servers.length < SERVER_LIMIT &&
    !session.servers.includes(server.id)
  ) {
    session.servers.push(server.id);
  }
  write(JOURNAL_SOURCE, "info", `свой сервер добавлен: ${address}`);
  return null;
}

/** Удаляет свой сервер из профиля и из сеанса; результаты остальных целы. */
async function removeCustomServer(
  session: DnsSession,
  serverId: string,
): Promise<string | null> {
  const next = session.customServers.filter((server) => server.id !== serverId);
  const error = await persistServers(session, next);
  if (error) return error;

  session.customServers = next;
  session.servers = session.servers.filter((id) => id !== serverId);
  session.hiddenServers = session.hiddenServers.filter((id) => id !== serverId);
  for (const key of [...session.cells.keys()]) {
    if (key.endsWith(`:${serverId}`)) session.cells.delete(key);
  }
  write(JOURNAL_SOURCE, "info", "свой сервер удалён");
  return null;
}

/** Создаёт подписки на события ядра один раз. */
function ensureSubscriptions(): void {
  if (subscriptions) return;
  subscriptions = (async () => {
    await onDnsResult(handleResult);
    await onDnsFinished(handleFinished);
    write(JOURNAL_SOURCE, "info", "подписка на события DNS активна");
  })().catch((error: unknown) => {
    subscriptions = null;
    const text = `подписка на события DNS не создана: ${String(error)}`;
    for (const session of sessions.values()) {
      session.status.run.error = text;
    }
    write(JOURNAL_SOURCE, "error", text);
  });
}

/** Раскладывает результат по всем сеансам с тем же `run_id`. */
function handleResult(event: DnsResultEvent): void {
  for (const session of sessions.values()) {
    if (!session.runId || session.runId !== event.run_id) continue;
    session.cells.set(resultKey(event.row_id, event.server_id), {
      status: event.status,
      answers: event.answers,
      elapsedMs: event.elapsed_ms,
      error: event.error,
    });
    session.progress.done = Math.min(
      session.progress.total,
      session.progress.done + 1,
    );
  }
}

/** Закрывает проверку: снимает ожидание и сообщает итог в журнал. */
function handleFinished(event: DnsFinishedEvent): void {
  for (const session of sessions.values()) {
    if (!session.runId || session.runId !== event.run_id) continue;

    session.status.run.loading = false;
    session.runId = null;

    for (const [key, cell] of [...session.cells]) {
      if (cell.status === "pending") {
        session.cells.set(key, {
          status: "cancelled",
          answers: [],
          elapsedMs: null,
          error: null,
        });
      }
    }

    const total = session.progress.total;
    if (event.cancelled) {
      write(
        JOURNAL_SOURCE,
        "info",
        `проверка остановлена: получено ${event.completed} из ${total}`,
      );
    } else {
      write(
        JOURNAL_SOURCE,
        "result",
        `проверка завершена: ${event.completed} из ${total} за ${event.elapsed_ms} мс`,
      );
    }
  }
}

/** Запускает проверку выбранных строк на всех выбранных серверах. */
async function runRows(session: DnsSession, rowIds: string[]): Promise<void> {
  if (session.status.run.loading) return;

  const requested = new Set(rowIds);
  const rows = session.rows.filter((row) => requested.has(row.id));
  if (rows.length === 0) return;

  if (session.servers.length === 0) {
    session.status.run.error = "Выберите хотя бы один сервер";
    return;
  }

  const known = new Map(allServers(session).map((server) => [server.id, server]));
  const servers: ServerOption[] = [];
  for (const id of session.servers) {
    const server = known.get(id);
    if (!server) {
      session.status.run.error = `Неизвестный сервер «${id}»`;
      return;
    }
    servers.push(server);
  }

  const total = rows.length * servers.length;
  if (total > QUERY_LIMIT) {
    session.status.run.error =
      `Слишком много запросов: ${total}. Предел — ${QUERY_LIMIT}. ` +
      "Уменьшите число строк или серверов";
    write(JOURNAL_SOURCE, "error", session.status.run.error);
    return;
  }

  const runId = crypto.randomUUID();
  session.runId = runId;
  session.status.run.loading = true;
  session.status.run.error = null;
  session.progress = { total, done: 0 };

  const queries: RunQuery[] = [];
  for (const row of rows) {
    for (const server of servers) {
      queries.push({
        query_id: resultKey(row.id, server.id),
        row_id: row.id,
        server_id: server.id,
        name: row.name,
        type: row.type,
      });

      // Старый результат не стирается, а прячется в `previous`: пока идёт
      // проверка, пользователь видит прежние значения приглушённо.
      const key = resultKey(row.id, server.id);
      const current = session.cells.get(key);
      const previous: CellSnapshot | undefined =
        current && current.status !== "pending"
          ? {
              status: current.status,
              answers: current.answers,
              elapsedMs: current.elapsedMs,
              error: current.error,
            }
          : current?.previous;
      session.cells.set(key, {
        status: "pending",
        answers: [],
        elapsedMs: null,
        error: null,
        previous,
      });
    }
  }

  write(
    JOURNAL_SOURCE,
    "info",
    `проверка запущена: ${total} запросов, ${servers.length} серверов`,
  );

  try {
    const accepted = await runDns({
      run_id: runId,
      queries,
      servers: servers.map((server) => ({
        id: server.id,
        address: server.address,
      })),
    });

    if (!accepted.accepted) {
      failRun(
        session,
        rows,
        servers,
        accepted.error ?? "Проверка отклонена ядром",
      );
    }
  } catch (error) {
    failRun(session, rows, servers, `Проверка не запущена: ${String(error)}`);
  }
}

/** Возвращает ячейки к прошлому состоянию, если запуск отклонён. */
function failRun(
  session: DnsSession,
  rows: DnsRow[],
  servers: ServerOption[],
  message: string,
): void {
  session.status.run.loading = false;
  session.status.run.error = message;
  session.runId = null;
  session.progress = { total: 0, done: 0 };

  for (const row of rows) {
    for (const server of servers) {
      const key = resultKey(row.id, server.id);
      const cell = session.cells.get(key);
      if (!cell || cell.status !== "pending") continue;
      if (cell.previous) {
        session.cells.set(key, {
          status: cell.previous.status,
          answers: cell.previous.answers,
          elapsedMs: cell.previous.elapsedMs,
          error: cell.previous.error,
        });
      } else {
        session.cells.delete(key);
      }
    }
  }

  write(JOURNAL_SOURCE, "error", message);
}

/** Просит ядро остановить текущую проверку. */
async function stopRun(session: DnsSession): Promise<void> {
  if (!session.runId || !session.status.run.loading) return;
  try {
    await cancelDns(session.runId);
  } catch (error) {
    session.status.run.error = `Не удалось остановить проверку: ${String(error)}`;
    write(JOURNAL_SOURCE, "error", session.status.run.error);
  }
}

/** Очищает строки и результаты; серверы и тип остаются. */
async function clearSession(session: DnsSession): Promise<void> {
  // Запуск отцепляется от сеанса до очистки: результаты отменённой проверки
  // уже не нужны и не должны вернуть прогресс в чистую таблицу.
  if (session.status.run.loading && session.runId) {
    try {
      await cancelDns(session.runId);
    } catch (error) {
      session.status.run.error = `Не удалось остановить проверку: ${String(error)}`;
      write(JOURNAL_SOURCE, "error", session.status.run.error);
    }
    session.runId = null;
    session.status.run.loading = false;
  }

  session.rows = [];
  session.cells.clear();
  session.highlightRowId = null;
  session.status.run.error = null;
  session.filters.search = "";
  session.filters.status = "all";
  session.filters.diffOnly = false;
  session.progress = { total: 0, done: 0 };

  write(JOURNAL_SOURCE, "info", "таблица очищена");
}

/** Сбрасывает результаты одной строки перед сменой типа. */
function resetRow(session: DnsSession, rowId: string): void {
  for (const key of [...session.cells.keys()]) {
    if (key.startsWith(`${rowId}:`)) session.cells.delete(key);
  }
}

/** Удаляет строку вместе с её результатами. */
function removeRow(session: DnsSession, rowId: string): void {
  session.rows = session.rows.filter((row) => row.id !== rowId);
  resetRow(session, rowId);
  if (session.highlightRowId === rowId) session.highlightRowId = null;
}

/** Подсвечивает строку-дубликат на короткое время. */
function highlightRow(session: DnsSession, rowId: string): void {
  // Сброс нужен, если та же строка подсвечивается повторно: иначе значение
  // не изменится и прокрутка не сработает.
  if (session.highlightRowId === rowId) session.highlightRowId = null;
  session.highlightRowId = rowId;
  const existing = highlightTimers.get(session);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    if (session.highlightRowId === rowId) session.highlightRowId = null;
    highlightTimers.delete(session);
  }, HIGHLIGHT_MS);
  highlightTimers.set(session, timer);
}

/** Добавляет строку и сразу проверяет её; дубликат не создаётся. */
function addRow(
  session: DnsSession,
  input: string,
  type: RecordType,
): AddRowResult {
  const parsed = parseAddressInput(input, type);
  if (!parsed.ok) {
    return { kind: "error", message: parsed.error };
  }

  const duplicate = session.rows.find(
    (row) =>
      row.type === type &&
      row.name.toLowerCase() === parsed.value.name.toLowerCase(),
  );
  if (duplicate) {
    highlightRow(session, duplicate.id);
    void runRows(session, [duplicate.id]);
    return { kind: "duplicate", rowId: duplicate.id };
  }

  const row: DnsRow = {
    id: crypto.randomUUID(),
    input: parsed.value.display,
    name: parsed.value.name,
    type,
  };
  session.rows.push(row);
  void runRows(session, [row.id]);
  return { kind: "added", rowId: row.id };
}

/** Строка CSV: кавычки удваиваются, разделитель — точка с запятой. */
function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Значение ячейки для CSV: подпись статуса и записи в формате зоны. */
function csvCell(cell: DnsCell | undefined): string {
  if (!cell) return "";
  const label = STATUS_LABELS[cell.status];
  const answers: DnsAnswer[] =
    cell.status === "pending" ? (cell.previous?.answers ?? []) : cell.answers;
  if (answers.length === 0) return label;
  return `${label}: ${answers.map((answer) => answer.value).join(" | ")}`;
}

/** Собирает CSV по текущему видимому результату. */
function buildCsv(
  session: DnsSession,
  rows: DnsRow[],
  servers: ServerOption[],
  verdicts: Map<string, RowVerdict>,
): string {
  const header = [
    "Домен",
    "Тип",
    ...servers.map((server) => server.label),
    "Совпадение",
  ];

  const lines = rows.map((row) => {
    const verdict = verdicts.get(row.id);
    const verdictText = verdict
      ? verdict.differs
        ? `расходится у ${verdict.total - verdict.matched} из ${verdict.total}`
        : `совпадает у ${verdict.matched} из ${verdict.total}`
      : "";

    return [
      row.input,
      row.type,
      ...servers.map((server) =>
        csvCell(session.cells.get(resultKey(row.id, server.id))),
      ),
      verdictText,
    ];
  });

  const csv = [header, ...lines]
    .map((line) => line.map(csvField).join(";"))
    .join("\r\n");

  // BOM нужен Excel: без него русский текст открывается кракозябрами.
  return `\uFEFF${csv}`;
}

/** Отдаёт CSV файлом; копия в буфер — запасной путь, её успех важен. */
async function saveCsv(
  csv: string,
): Promise<{ method: "download" | "clipboard"; copied: boolean }> {
  let downloaded = false;
  try {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dns-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    downloaded = true;
  } catch {
    downloaded = false;
  }

  // Блокировка скачивания в окне приложения не всегда даёт исключение,
  // поэтому копия в буфер — не запасной обработчик, а постоянный шаг.
  let copied = false;
  try {
    await navigator.clipboard.writeText(csv);
    copied = true;
  } catch {
    copied = false;
  }

  if (!downloaded && !copied) {
    throw new Error("Не удалось сохранить CSV и скопировать его в буфер");
  }

  return { method: downloaded ? "download" : "clipboard", copied };
}

/** Сравнивает статус и множество значений; TTL, регистр и точка не важны. */
function cellsMatch(base: DnsCell, other: DnsCell): boolean {
  if (base.status !== other.status) return false;
  return signature(base) === signature(other);
}

/** Отпечаток набора записей: порядок, регистр и завершающая точка сняты. */
function signature(cell: DnsCell): string {
  return cell.answers
    .map((answer) => answer.value.trim().toLowerCase().replace(/\.$/, ""))
    .sort()
    .join("\n");
}

/** Проверяет, попадает ли строка под фильтр статуса. */
function matchesStatus(
  session: DnsSession,
  rowId: string,
  filter: StatusFilter,
): boolean {
  if (filter === "all") return true;
  const pool = filter === "error" ? ERROR_STATUSES : EMPTY_STATUSES;
  return session.servers.some((serverId) => {
    const cell = session.cells.get(resultKey(rowId, serverId));
    return cell !== undefined && pool.includes(cell.status);
  });
}

/**
 * Состояние одного места в сетке.
 *
 * Возвращает только то, что нужно разметке; правила запуска, фильтрации
 * и сравнения остаются здесь, а не в компонентах.
 */
export function useDnslookup(props: ToolCellProps) {
  pruneSessions();
  ensureSubscriptions();
  const session = sessionFor(props.cellKey ?? STANDALONE_CELL_KEY);

  const availableServers = computed<ServerOption[]>(() => allServers(session));

  const selectedServers = computed<ServerOption[]>(() =>
    session.servers
      .map((id) => availableServers.value.find((server) => server.id === id))
      .filter((server): server is ServerOption => server !== undefined),
  );

  /** Колонки таблицы: выбранные серверы минус скрытые. */
  const columnServers = computed<ServerOption[]>(() =>
    selectedServers.value.filter(
      (server) => !session.hiddenServers.includes(server.id),
    ),
  );

  const hasSystem = computed(() =>
    session.servers.includes(SYSTEM_SERVER_ID),
  );

  /** Адреса доступных серверов в каноническом виде: по ним ищутся дубликаты. */
  const occupiedAddresses = computed<string[]>(() =>
    availableServers.value
      .map((server) => server.address)
      .filter((address): address is string => address !== null)
      .map((address) => {
        const parsed = parseServerAddress(address);
        return parsed.ok ? parsed.address : address;
      }),
  );

  /** Сравнение возможно, только если системный сервер не единственный. */
  const canCompare = computed(
    () => hasSystem.value && selectedServers.value.length > 1,
  );

  // Скрытая колонка принадлежит выбору сервера: после снятия и повторного
  // выбора она снова видима. Фильтр расхождений без системного сервера
  // не имеет смысла и снимается сам.
  watch(
    () => [...session.servers],
    (selected) => {
      session.hiddenServers = session.hiddenServers.filter((id) =>
        selected.includes(id),
      );
      if (!selected.includes(SYSTEM_SERVER_ID)) session.filters.diffOnly = false;
    },
  );

  /** Сравнение с системным сервером: без него вердикта нет. */
  const verdicts = computed<Map<string, RowVerdict>>(() => {
    const result = new Map<string, RowVerdict>();
    const others = session.servers.filter((id) => id !== SYSTEM_SERVER_ID);
    if (!hasSystem.value || others.length === 0) return result;

    for (const row of session.rows) {
      const base = session.cells.get(resultKey(row.id, SYSTEM_SERVER_ID));
      if (!base || base.status === "pending" || base.status === "cancelled") {
        continue;
      }

      let matched = 0;
      let ready = true;
      for (const serverId of others) {
        const cell = session.cells.get(resultKey(row.id, serverId));
        // Пока хотя бы одна ячейка не ответила, вердикт не считается:
        // иначе строка на миг «расходилась» бы из-за порядка ответов.
        if (!cell || cell.status === "pending" || cell.status === "cancelled") {
          ready = false;
          break;
        }
        if (cellsMatch(base, cell)) matched += 1;
      }
      if (!ready) continue;

      result.set(row.id, {
        matched,
        total: others.length,
        differs: matched < others.length,
      });
    }
    return result;
  });

  const visibleRows = computed<DnsRow[]>(() => {
    const search = session.filters.search.trim().toLowerCase();
    return session.rows.filter((row) => {
      if (search !== "") {
        const haystack = `${row.input} ${row.name}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      if (!matchesStatus(session, row.id, session.filters.status)) return false;
      if (session.filters.diffOnly) {
        return verdicts.value.get(row.id)?.differs === true;
      }
      return true;
    });
  });

  const diffCount = computed(
    () =>
      [...verdicts.value.values()].filter((verdict) => verdict.differs).length,
  );

  const canRun = computed(
    () =>
      session.rows.length > 0 &&
      session.servers.length > 0 &&
      !session.status.run.loading,
  );

  const running = computed(() => session.status.run.loading);

  return {
    session,
    availableServers,
    selectedServers,
    columnServers,
    hasSystem,
    occupiedAddresses,
    canCompare,
    verdicts,
    visibleRows,
    diffCount,
    canRun,
    running,
    addRow: (input: string, type: RecordType): AddRowResult =>
      addRow(session, input, type),
    addCustomServer: (label: string, address: string): Promise<string | null> =>
      addCustomServer(session, label, address),
    removeCustomServer: (serverId: string): Promise<string | null> =>
      removeCustomServer(session, serverId),
    exportCsv: async (): Promise<{
      method: "download" | "clipboard";
      copied: boolean;
      rows: number;
    }> => {
      const csv = buildCsv(
        session,
        visibleRows.value,
        columnServers.value,
        verdicts.value,
      );
      const saved = await saveCsv(csv);
      write(
        JOURNAL_SOURCE,
        "result",
        `CSV выгружен: ${visibleRows.value.length} строк, ` +
          (saved.method === "download" ? "файл" : "буфер обмена"),
      );
      return {
        method: saved.method,
        copied: saved.copied,
        rows: visibleRows.value.length,
      };
    },
    runAll: (): void => {
      void runRows(
        session,
        session.rows.map((row) => row.id),
      );
    },
    runRow: (rowId: string): void => {
      void runRows(session, [rowId]);
    },
    cancel: (): void => {
      void stopRun(session);
    },
    clear: (): Promise<void> => clearSession(session),
    changeType: (rowId: string, type: RecordType): void => {
      const row = session.rows.find((item) => item.id === rowId);
      if (!row || row.type === type) return;
      row.type = type;
      resetRow(session, rowId);
      void runRows(session, [rowId]);
    },
    removeRow: (rowId: string): void => removeRow(session, rowId),
    refreshServers: (): void => {
      void refreshServers(session);
    },
  };
}

// Серверы инструмента DNS.
//
// Сервер бывает системным, преднастроенным и своим. Свои серверы лежат
// в профиле отдельным файлом, поэтому чтение и запись идут через `api.ts`,
// а ошибки остаются в статусах операций: таблица продолжает работать с тем,
// что удалось прочитать.
//
// Чтение и запись — разные операции, поэтому и статусы разные:
// `status.servers` и `status.serversSave`. Загрузку и текст отказа ведёт
// `useAsyncAction`; здесь остаются правила домена — что читать и когда
// запись запрещена.
//
// Запись поверх повреждённого файла запрещена: пользователь сначала чинит
// или удаляет его, иначе восстановимые данные потерялись бы.

import { appErrorOf, describeError } from "@/core/infra/errors";
import { t } from "@/core/infra/i18n";
import { write, type JournalFact } from "@/core/infra/journal";
import { useAsyncAction, type AsyncAction } from "@/core/infra/useAsyncAction";
import { loadCustomServers, loadSystemServers, saveCustomServers, type StoredServer } from "../api";
import { JOURNAL_SOURCE, presetServers, SERVER_LIMIT } from "../constants";
import { parseServerAddress } from "../normalize";
import type { DnsSession, ServerOption } from "../types";

/** Все доступные серверы сеанса: преднастроенные и свои. */
export function allServers(session: DnsSession): ServerOption[] {
  return [...presetServers(), ...session.customServers];
}

/** Адреса доступных серверов в каноническом виде: по ним ищутся дубликаты. */
export function canonicalAddresses(session: DnsSession): string[] {
  return allServers(session)
    .map((server) => server.address)
    .filter((address): address is string => address !== null)
    .map((address) => {
      const parsed = parseServerAddress(address);
      return parsed.ok ? parsed.address : address;
    });
}

/** Операции серверов одного сеанса. */
interface ServerActions {
  read: AsyncAction;
  save: AsyncAction<[ServerOption[]], true>;
}

/** Операции по сеансу: создаются один раз и держат его статусы. */
const serverActionsBySession = new WeakMap<DnsSession, ServerActions>();

/** Операции сеанса: статусы подменяются на обёрнутые при первом обращении. */
function serverActions(session: DnsSession): ServerActions {
  const existing = serverActionsBySession.get(session);
  if (existing) return existing;

  const actions: ServerActions = {
    read: useAsyncAction(() => readServers(session)),
    save: useAsyncAction((servers: ServerOption[]) => writeServers(session, servers)),
  };
  session.status.servers = actions.read.status;
  session.status.serversSave = actions.save.status;
  serverActionsBySession.set(session, actions);
  return actions;
}

/** Идущее чтение серверов: загрузка пресета ждёт его, а не пропускает. */
const serverRefreshes = new WeakMap<DnsSession, Promise<void>>();

/**
 * Читает системные резолверы и свои серверы.
 *
 * Повторный вызов во время чтения возвращает тот же запрос: загрузке пресета
 * нужны все серверы, и пропустить чтение значило бы не найти свои серверы.
 */
export function refreshServers(session: DnsSession): Promise<void> {
  const running = serverRefreshes.get(session);
  if (running) return running;

  const task = serverActions(session)
    .read.run()
    .then(() => undefined);
  serverRefreshes.set(session, task);
  void task.finally(() => serverRefreshes.delete(session));
  return task;
}

/**
 * Читает серверы один раз.
 *
 * Две операции независимы, поэтому идут параллельно: ошибка чтения файла
 * не должна скрывать адреса, полученные от ОС. Причины собираются в одну
 * строку — пользователю важны обе.
 */
async function readServers(session: DnsSession): Promise<void> {
  const errors: string[] = [];
  const facts: JournalFact[] = [];
  const [system, custom] = await Promise.allSettled([loadSystemServers(), loadCustomServers()]);

  if (system.status === "fulfilled") {
    session.systemAddresses = system.value.servers;
    if (system.value.error) {
      errors.push(describeError(system.value.error));
      facts.push({
        code: "journal.dnslookup.systemServersFailed",
        params: { reason: system.value.error },
      });
    }
  } else {
    errors.push(
      t("dnslookup.servers.systemReadError", {
        reason: describeError(system.reason),
      }),
    );
    facts.push({
      code: "journal.dnslookup.systemServersFailed",
      params: { reason: appErrorOf(system.reason) },
    });
  }

  if (custom.status === "fulfilled") {
    session.serversBroken = custom.value.error !== null;
    if (custom.value.error) {
      errors.push(describeError(custom.value.error));
      facts.push({
        code: "journal.dnslookup.customServersFailed",
        params: { reason: custom.value.error },
      });
    } else {
      session.customServers = custom.value.servers.map((server) => ({
        ...server,
        kind: "custom" as const,
      }));
    }
  } else {
    session.serversBroken = false;
    errors.push(
      t("dnslookup.servers.customReadError", {
        reason: describeError(custom.reason),
      }),
    );
    facts.push({
      code: "journal.dnslookup.customServersFailed",
      params: { reason: appErrorOf(custom.reason) },
    });
  }

  if (errors.length > 0) {
    const text = errors.join("; ");
    for (const fact of facts) {
      write(JOURNAL_SOURCE, "error", fact.code, fact.params);
    }
    throw new Error(text);
  }
}

/**
 * Пишет свои серверы в профиль.
 *
 * Возвращает `true` при успехе и сообщает об отказе исключением: обёртка
 * переводит его в `status.serversSave.error`, а диалог показывает текст.
 */
async function writeServers(session: DnsSession, servers: ServerOption[]): Promise<true> {
  if (session.serversBroken) {
    // Запись поверх испорченного файла потеряла бы то, что ещё можно
    // восстановить руками: сначала пользователь чинит или удаляет файл.
    const text = t("dnslookup.servers.brokenFile");
    write(JOURNAL_SOURCE, "error", "dnslookup.servers.brokenFile");
    throw new Error(text);
  }

  const payload: StoredServer[] = servers.map((server) => ({
    id: server.id,
    label: server.label,
    address: server.address ?? "",
  }));

  const reply = await saveCustomServers(payload);
  if (!reply.saved || reply.error) {
    const text = reply.error ? describeError(reply.error) : t("dnslookup.servers.saveFailed");
    if (reply.error) {
      write(JOURNAL_SOURCE, "error", "journal.dnslookup.serversSaveFailed", {
        reason: reply.error,
      });
    } else {
      write(JOURNAL_SOURCE, "error", "dnslookup.servers.saveFailed");
    }
    throw new Error(text);
  }
  return true;
}

/** Сохраняет свои серверы; возвращает текст ошибки или `null`. */
async function persistServers(
  session: DnsSession,
  servers: ServerOption[],
): Promise<string | null> {
  const save = serverActions(session).save;
  if (save.status.loading) return t("dnslookup.servers.saving");

  const saved = await save.run(servers);
  return saved === null ? save.status.error : null;
}

/** Добавляет свой сервер: сохраняет, затем выбирает его в сеансе. */
export async function addCustomServer(
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

  const error = await persistServers(session, [...session.customServers, server]);
  if (error) return error;

  session.customServers = [...session.customServers, server];
  if (session.servers.length < SERVER_LIMIT && !session.servers.includes(server.id)) {
    session.servers.push(server.id);
  }
  write(JOURNAL_SOURCE, "info", "journal.dnslookup.serverAdded", { address });
  return null;
}

/** Удаляет свой сервер из профиля и из сеанса; результаты остальных целы. */
export async function removeCustomServer(
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
  write(JOURNAL_SOURCE, "info", "journal.dnslookup.serverRemoved");
  return null;
}

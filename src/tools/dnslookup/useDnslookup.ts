// Состояние инструмента DNS.
//
// Сеанс, серверы, запуск, строки и сравнение разложены по соседним
// файлам; здесь остаётся тонкий фасад: он находит сеанс по `cellKey`,
// собирает производные значения и отдаёт компоненту готовый набор действий.
// Правила запуска, фильтрации и сравнения живут в своих файлах, а не
// в разметке.
//
// Подписки на события ядра модульные: результат, полученный пока пользователь
// смотрел журнал, обязан попасть в сеанс. Состояния операций гранулярные:
// `status.run` и `status.servers` независимы (правило Vue).

import { computed, watch } from "vue";
import type { ToolCellProps } from "@/contracts/tools";
import { buildVerdicts } from "./state/compare";
import { STANDALONE_CELL_KEY, SYSTEM_SERVER_ID } from "./constants";
import { addRow, filterRows, moveRow, removeRow, resetRow } from "./state/rows";
import { ensureSubscriptions, runAllRows, runRows, stopRun } from "./state/run";
import {
  addCustomServer,
  allServers,
  canonicalAddresses,
  refreshServers,
  removeCustomServer,
} from "./state/servers";
import { pruneSessions, sessionFor } from "./state/session";
import type { AddRowResult, RecordType, RowVerdict, ServerOption } from "./types";

/**
 * Состояние одного места в сетке.
 *
 * Возвращает только то, что нужно разметке; правила запуска, фильтрации
 * и сравнения остаются в соседних файлах, а не в компонентах.
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
    selectedServers.value.filter((server) => !session.hiddenServers.includes(server.id)),
  );

  const hasSystem = computed(() => session.servers.includes(SYSTEM_SERVER_ID));

  /** Адреса доступных серверов в каноническом виде: по ним ищутся дубликаты. */
  const occupiedAddresses = computed<string[]>(() => canonicalAddresses(session));

  /** Сравнение возможно, только если системный сервер не единственный. */
  const canCompare = computed(() => hasSystem.value && selectedServers.value.length > 1);

  // Скрытая колонка принадлежит выбору сервера: после снятия и повторного
  // выбора она снова видима. Фильтр расхождений без системного сервера
  // не имеет смысла и снимается сам.
  watch(
    () => [...session.servers],
    (selected) => {
      session.hiddenServers = session.hiddenServers.filter((id) => selected.includes(id));
      if (!selected.includes(SYSTEM_SERVER_ID)) session.filters.diffOnly = false;
    },
  );

  /** Сравнение с системным сервером: без него вердикта нет. */
  const verdicts = computed<Map<string, RowVerdict>>(() => buildVerdicts(session));

  const visibleRows = computed(() => filterRows(session, verdicts.value));

  const diffCount = computed(
    () => [...verdicts.value.values()].filter((verdict) => verdict.differs).length,
  );

  const canRun = computed(
    () => session.rows.length > 0 && session.servers.length > 0 && !session.status.run.loading,
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
    addRow: (input: string, type: RecordType): AddRowResult => addRow(session, input, type),
    addCustomServer: (label: string, address: string): Promise<string | null> =>
      addCustomServer(session, label, address),
    removeCustomServer: (serverId: string): Promise<string | null> =>
      removeCustomServer(session, serverId),
    runAll: (): void => runAllRows(session),
    runRow: (rowId: string): void => {
      void runRows(session, [rowId]);
    },
    cancel: (): void => {
      void stopRun(session);
    },
    changeType: (rowId: string, type: RecordType): void => {
      const row = session.rows.find((item) => item.id === rowId);
      if (!row || row.type === type) return;
      row.type = type;
      resetRow(session, rowId);
      void runRows(session, [rowId]);
    },
    removeRow: (rowId: string): void => removeRow(session, rowId),
    moveRow: (from: number, to: number): void => moveRow(session, visibleRows.value, from, to),
    refreshServers: (): void => {
      void refreshServers(session);
    },
  };
}

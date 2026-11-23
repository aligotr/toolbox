// Состояние инструмента Ping.
//
// Сеанс, цели, запуск и выгрузка разложены по соседним файлам; здесь
// остаётся тонкий фасад: он находит сеанс по `cellKey`, собирает производные
// значения и отдаёт компоненту готовый набор действий. Правила запуска
// и фильтрации живут в своих файлах, а не в разметке.
//
// Подписки на события ядра модульные: пакет, полученный пока пользователь
// смотрел журнал, обязан попасть в сеанс.

import { computed } from "vue";
import type { ToolCellProps } from "@/contracts/tools";
import { write, type JournalFact } from "@/core/infra/journal";
import {
  JOURNAL_SOURCE,
  MAX_COUNT,
  MAX_PERIOD_MS,
  MAX_TIMEOUT_MS,
  MIN_COUNT,
  MIN_PERIOD_MS,
  MIN_TIMEOUT_MS,
  STANDALONE_CELL_KEY,
} from "./constants";
import { buildPacketsCsv, buildSummaryCsv, saveCsv } from "./state/csv";
import { runAll, runTargets, stopRun } from "./state/run";
import { pruneSessions, sessionFor } from "./state/session";
import { ensureSubscriptions } from "./state/subscriptions";
import { addTarget, clearSession, filterTargets, moveTarget, removeTarget } from "./state/targets";
import type { AddTargetResult, Family, IcmpTarget } from "./types";

/** Итог выгрузки: способ, копия в буфере и число строк. */
export interface ExportResult {
  method: "download" | "clipboard";
  copied: boolean;
  rows: number;
}

/** Состояние одного места в сетке. */
export function useIcmp(props: ToolCellProps) {
  pruneSessions();
  void ensureSubscriptions();
  const session = sessionFor(props.cellKey ?? STANDALONE_CELL_KEY);

  const running = computed(() => session.status.run.loading);
  const visibleTargets = computed(() => filterTargets(session));
  const canRun = computed(() => session.targets.length > 0 && !running.value);
  const periodInvalid = computed(
    () =>
      !Number.isInteger(session.periodMs) ||
      session.periodMs < MIN_PERIOD_MS ||
      session.periodMs > MAX_PERIOD_MS,
  );
  const countInvalid = computed(
    () =>
      !Number.isInteger(session.count) || session.count < MIN_COUNT || session.count > MAX_COUNT,
  );
  const timeoutInvalid = computed(
    () =>
      !Number.isInteger(session.timeoutMs) ||
      session.timeoutMs < MIN_TIMEOUT_MS ||
      session.timeoutMs > MAX_TIMEOUT_MS,
  );

  /** Выгружает сводку и пишет факт в журнал. */
  async function exportSummary(): Promise<ExportResult> {
    const csv = buildSummaryCsv(session, visibleTargets.value);
    const rows = summaryRowCount(visibleTargets.value);
    return save(csv, "ping-summary", rows);
  }

  /** Выгружает пакеты и пишет факт в журнал. */
  async function exportPackets(): Promise<ExportResult> {
    const csv = buildPacketsCsv(visibleTargets.value);
    const rows = packetRowCount(visibleTargets.value);
    return save(csv, "ping-packets", rows);
  }

  return {
    session,
    running,
    visibleTargets,
    canRun,
    periodInvalid,
    countInvalid,
    timeoutInvalid,
    addTarget: (input: string, family: Family): AddTargetResult =>
      addTarget(session, input, family),
    runAll: (): void => runAll(session),
    runTarget: (targetId: string): void => {
      void runTargets(session, [targetId]);
    },
    cancel: (): void => {
      void stopRun(session);
    },
    clear: (): Promise<void> => clearSession(session),
    removeTarget: (targetId: string): void => removeTarget(session, targetId),
    moveTarget: (from: number, to: number): void =>
      moveTarget(session, visibleTargets.value, from, to),
    exportSummary,
    exportPackets,
  };
}

/** Строк в выгрузке сводки: по одной на адрес, у неразрешённой цели - одна. */
function summaryRowCount(targets: IcmpTarget[]): number {
  return targets.reduce((sum, target) => sum + Math.max(target.addresses.length, 1), 0);
}

/** Строк в выгрузке пакетов: по одной на отправленный пакет. */
function packetRowCount(targets: IcmpTarget[]): number {
  return targets.reduce(
    (sum, target) =>
      sum + target.addresses.reduce((packets, address) => packets + address.packets.length, 0),
    0,
  );
}

/** Общая часть выгрузки: файл, копия и запись в журнал. */
async function save(csv: string, name: string, rows: number): Promise<ExportResult> {
  const saved = await saveCsv(csv, name);
  const fact: JournalFact =
    saved.method === "download"
      ? { code: "journal.icmp.csvFile", params: { rows } }
      : { code: "journal.icmp.csvClipboard", params: { rows } };
  write(JOURNAL_SOURCE, "result", fact.code, fact.params);
  return { method: saved.method, copied: saved.copied, rows };
}

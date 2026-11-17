// Выгрузка таблицы DNS в CSV.
//
// Выгружается то, что видит пользователь: видимые строки, видимые серверы,
// текущий вердикт сравнения. Значение ячейки — подпись статуса и записи
// в формате зоны.
//
// Файл отдаётся скачиванием; копия в буфер — постоянный второй шаг, потому
// что окно приложения не всегда сообщает о блокировке скачивания.

import { t } from "@/core/infra/i18n";
import { statusText } from "../cell";
import { resultKey } from "./session";
import type { DnsAnswer, DnsCell, DnsRow, DnsSession, RowVerdict, ServerOption } from "../types";

/** Строка CSV: кавычки удваиваются, разделитель — точка с запятой. */
function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Значение ячейки для CSV: подпись статуса и записи в формате зоны. */
function csvCell(cell: DnsCell | undefined): string {
  if (!cell) return "";
  const label = statusText(cell.status);
  const answers: DnsAnswer[] =
    cell.status === "pending" ? (cell.previous?.answers ?? []) : cell.answers;
  if (answers.length === 0) return label;
  return `${label}: ${answers.map((answer) => answer.value).join(" | ")}`;
}

/** Собирает CSV по текущему видимому результату. */
export function buildCsv(
  session: DnsSession,
  rows: DnsRow[],
  servers: ServerOption[],
  verdicts: Map<string, RowVerdict>,
): string {
  const header = [
    t("dnslookup.csv.domain"),
    t("dnslookup.csv.type"),
    ...servers.map((server) => server.label),
    t("dnslookup.csv.match"),
  ];

  const lines = rows.map((row) => {
    const verdict = verdicts.get(row.id);
    const verdictText = verdict
      ? verdict.differs
        ? t("dnslookup.csv.differs", {
            count: verdict.total - verdict.matched,
            total: verdict.total,
          })
        : t("dnslookup.csv.matches", {
            count: verdict.matched,
            total: verdict.total,
          })
      : "";

    return [
      row.input,
      row.type,
      ...servers.map((server) => csvCell(session.cells.get(resultKey(row.id, server.id)))),
      verdictText,
    ];
  });

  const csv = [header, ...lines].map((line) => line.map(csvField).join(";")).join("\r\n");

  // BOM нужен Excel: без него русский текст открывается кракозябрами.
  return `\uFEFF${csv}`;
}

/** Отдаёт CSV файлом; копия в буфер — запасной путь, её успех важен. */
export async function saveCsv(
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
    // Окно приложения может запретить скачивание: тогда остаётся буфер.
  }

  // Блокировка скачивания в окне приложения не всегда даёт исключение,
  // поэтому копия в буфер — не запасной обработчик, а постоянный шаг.
  let copied = false;
  try {
    await navigator.clipboard.writeText(csv);
    copied = true;
  } catch {
    // Буфер обмена может быть недоступен: тогда остаётся скачивание.
  }

  if (!downloaded && !copied) {
    throw new Error(t("dnslookup.csv.saveFailed"));
  }

  return { method: downloaded ? "download" : "clipboard", copied };
}

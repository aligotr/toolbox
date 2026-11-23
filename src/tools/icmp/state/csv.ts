// Выгрузка проверки Ping в CSV.
//
// Две выгрузки отвечают на разные вопросы: сводка - «как дела у адресов»,
// пакеты - «что было с каждым пакетом». Выгружается то, что видит
// пользователь: видимые строки и текущие фильтры.
//
// Файл отдаётся скачиванием; копия в буфер - постоянный второй шаг, потому
// что окно приложения не всегда сообщает о блокировке скачивания.

import { t } from "@/core/infra/i18n";
import { addressCaption, addressStatus, statsOf, targetStats, targetStatus } from "../summary";
import { csvNumber, familyText, packetStatusText, statusText } from "../cell";
import type { IcmpSession, IcmpTarget, PacketRecord } from "../types";

/**
 * Поле CSV в кавычках.
 *
 * Текст, который Excel принял бы за формулу, получает ведущий апостроф:
 * цель из пресета или ввода не должна выполняться при открытии файла.
 * Обычное отрицательное число остаётся числом.
 */
function csvField(value: string): string {
  const formula = /^[=+\-@\t\r]/.test(value) && !/^-\d+(\.\d+)?$/.test(value);
  const safe = formula ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Собирает CSV из заголовка и строк. BOM нужен Excel для кириллицы. */
function build(lines: string[][]): string {
  const csv = lines.map((line) => line.map(csvField).join(";")).join("\r\n");
  return `\uFEFF${csv}`;
}

/** Итоговая строка по адресу; неразрешённая цель даёт одну пустую строку. */
function summaryLines(target: IcmpTarget, running: boolean): string[][] {
  if (target.addresses.length === 0) {
    const stats = targetStats(target);
    return [
      [
        target.input,
        "",
        "",
        String(stats.sent),
        String(stats.received),
        csvNumber(stats.loss),
        csvNumber(stats.min),
        csvNumber(stats.avg),
        csvNumber(stats.max),
        csvNumber(stats.last),
        statusText(targetStatus(target, running)),
      ],
    ];
  }

  return target.addresses.map((address) => {
    const stats = statsOf(address.packets);
    return [
      target.input,
      addressCaption(address),
      familyText(address.family),
      String(stats.sent),
      String(stats.received),
      csvNumber(stats.loss),
      csvNumber(stats.min),
      csvNumber(stats.avg),
      csvNumber(stats.max),
      csvNumber(stats.last),
      statusText(addressStatus(address, running)),
    ];
  });
}

/** Сводка по адресам: строка на адрес проверки. */
export function buildSummaryCsv(session: IcmpSession, targets: IcmpTarget[]): string {
  const running = session.status.run.loading;
  const header = [
    t("icmp.csv.target"),
    t("icmp.csv.address"),
    t("icmp.csv.family"),
    t("icmp.csv.sent"),
    t("icmp.csv.received"),
    t("icmp.csv.loss"),
    t("icmp.csv.min"),
    t("icmp.csv.avg"),
    t("icmp.csv.max"),
    t("icmp.csv.last"),
    t("icmp.csv.status"),
  ];

  const lines = targets.flatMap((target) => summaryLines(target, running));
  return build([header, ...lines]);
}

/** Время пакета в местном виде: CSV открывают в таблице, а не в редакторе. */
function packetTime(packet: PacketRecord): string {
  const date = new Date(packet.atMs);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

/** Пакеты: строка на каждый отправленный пакет. */
export function buildPacketsCsv(targets: IcmpTarget[]): string {
  const header = [
    t("icmp.csv.target"),
    t("icmp.csv.address"),
    t("icmp.csv.family"),
    t("icmp.csv.sequence"),
    t("icmp.csv.status"),
    t("icmp.csv.rtt"),
    t("icmp.csv.ttl"),
    t("icmp.csv.time"),
  ];

  const lines: string[][] = [];
  for (const target of targets) {
    for (const address of target.addresses) {
      for (const packet of address.packets) {
        lines.push([
          target.input,
          addressCaption(address),
          familyText(address.family),
          String(packet.sequence),
          packetStatusText(packet.status),
          csvNumber(packet.rttMs),
          packet.ttl === null ? "" : String(packet.ttl),
          packetTime(packet),
        ]);
      }
    }
  }

  return build([header, ...lines]);
}

/** Отдаёт CSV файлом; копия в буфер - запасной путь, её успех важен. */
export async function saveCsv(
  csv: string,
  name: string,
): Promise<{ method: "download" | "clipboard"; copied: boolean }> {
  let downloaded = false;
  try {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    downloaded = true;
  } catch {
    // Окно приложения может запретить скачивание: тогда остаётся буфер.
  }

  // Блокировка скачивания в окне приложения не всегда даёт исключение,
  // поэтому копия в буфер - не запасной обработчик, а постоянный шаг.
  let copied = false;
  try {
    await navigator.clipboard.writeText(csv);
    copied = true;
  } catch {
    // Буфер обмена может быть недоступен: тогда остаётся скачивание.
  }

  if (!downloaded && !copied) {
    throw new Error(t("icmp.csv.saveFailed"));
  }

  return { method: downloaded ? "download" : "clipboard", copied };
}

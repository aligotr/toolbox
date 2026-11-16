// Нормализация и проверка ввода DNS.
//
// Интерфейс проверяет то же, что и Rust, но раньше: ошибка видна у поля,
// а не в событии результата. Проверка нарочно не строже ядра: всё, что здесь
// отклонено, ядро тоже не примет, и наоборот — «999.1.1.1» остаётся доменом,
// потому что это допустимое DNS-имя.
//
// IDN переводится в punycode через разбор URL: браузерный парсер уже умеет
// IDNA и не тянет отдельную зависимость. Показ остаётся пользовательским,
// запрос уходит в ASCII.

import { t } from "@/core/infra/i18n";
import type { RecordType } from "./types";

/** Предел длины имени и метки по RFC. */
const MAX_NAME_LENGTH = 253;
const MAX_LABEL_LENGTH = 63;

/** Допустимые символы метки: подчёркивание встречается в служебных именах. */
const LABEL_PATTERN = /^[a-z0-9_-]+$/;

/** Обратные зоны, в которых допустимо имя для типа PTR. */
const REVERSE_ZONE_PATTERN = /\.(in-addr|ip6)\.arpa$/i;

/** Результат разбора: нормализованное имя и текст для показа. */
export interface ParsedAddress {
  /** Значение для запроса: punycode, нижний регистр, без точки в конце. */
  name: string;
  /** Текст для таблицы: как ввёл пользователь, без завершающей точки. */
  display: string;
}

export type AddressResult =
  | { ok: true; value: ParsedAddress }
  | { ok: false; error: string };

/**
 * Разбирает домен или IP с учётом типа записи.
 *
 * IP допустим только для PTR: остальные типы спрашивают имя, а не адрес.
 * Для PTR принимается и готовое reverse-имя.
 */
export function parseAddressInput(input: string, type: RecordType): AddressResult {
  const raw = input.trim();
  if (raw === "") {
    return { ok: false, error: t("dnslookup.validate.emptyAddress") };
  }

  const ip = canonicalIp(raw);
  if (ip !== null) {
    if (type !== "PTR") {
      return { ok: false, error: t("dnslookup.validate.ipPtrOnly") };
    }
    return { ok: true, value: { name: ip, display: raw } };
  }

  if (type === "PTR" && !REVERSE_ZONE_PATTERN.test(raw)) {
    return {
      ok: false,
      error: t("dnslookup.validate.ptrZone"),
    };
  }

  const display = raw.endsWith(".") ? raw.slice(0, -1) : raw;
  const name = toAscii(display);
  if (name === null) {
    return { ok: false, error: t("dnslookup.validate.badName", { name: display }) };
  }

  const wildcard = name.startsWith("*.");
  const labels = (wildcard ? name.slice(2) : name).split(".");
  if (wildcard && labels.length === 0) {
    return { ok: false, error: t("dnslookup.validate.wildcard") };
  }
  if (name.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      error: t("dnslookup.validate.nameTooLong", { limit: MAX_NAME_LENGTH }),
    };
  }
  for (const label of labels) {
    if (label === "") {
      return { ok: false, error: t("dnslookup.validate.emptyLabel") };
    }
    if (label.length > MAX_LABEL_LENGTH) {
      return {
        ok: false,
        error: t("dnslookup.validate.labelTooLong", {
          label,
          limit: MAX_LABEL_LENGTH,
        }),
      };
    }
    if (!LABEL_PATTERN.test(label)) {
      return {
        ok: false,
        error: t("dnslookup.validate.badChar", { label }),
      };
    }
  }

  return { ok: true, value: { name, display } };
}

/** Переводит имя в ASCII-форму URL-парсером; `null` — имя не разобралось. */
function toAscii(display: string): string | null {
  let url: URL;
  try {
    url = new URL(`http://${display}`);
  } catch {
    return null;
  }

  // Порт, путь, логин и якорь означают, что это не домен, а что-то другое.
  if (
    url.port !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    return null;
  }

  // Хост URL уже в нижнем регистре и punycode; завершающая точка остаётся.
  return url.hostname.endsWith(".")
    ? url.hostname.slice(0, -1)
    : url.hostname;
}

/** Результат разбора адреса сервера: всегда с явным портом. */
export type ServerAddressResult =
  | { ok: true; address: string }
  | { ok: false; error: string };

/**
 * Разбирает адрес своего сервера: `IP`, `IP:порт`, `[IPv6]:порт`.
 *
 * Порт по умолчанию — 53. Адрес возвращается каноническим, с явным портом:
 * так «1.1.1.1» и «1.1.1.1:53» считаются одним сервером, и это же значение
 * уходит в Rust.
 */
export function parseServerAddress(input: string): ServerAddressResult {
  const text = input.trim();
  if (text === "") {
    return { ok: false, error: t("dnslookup.validate.serverEmpty") };
  }

  // IPv6 в скобках, порт необязателен.
  const bracketed = /^\[([^\]]+)\](?::(\d+))?$/.exec(text);
  if (bracketed) {
    const host = canonicalIp(bracketed[1]);
    if (host === null) {
      return {
        ok: false,
        error: t("dnslookup.validate.badIpv6", { address: bracketed[1] }),
      };
    }
    const port = bracketed[2] === undefined ? 53 : parsePort(bracketed[2]);
    if (port === null) {
      return {
        ok: false,
        error: t("dnslookup.validate.badPort", { address: text }),
      };
    }
    return { ok: true, address: `[${host}]:${port}` };
  }

  const colons = (text.match(/:/g) ?? []).length;
  if (colons >= 2) {
    const host = canonicalIp(text);
    if (host === null) {
      return {
        ok: false,
        error: t("dnslookup.validate.badIpv6", { address: text }),
      };
    }
    return { ok: true, address: `[${host}]:53` };
  }

  if (colons === 1) {
    const [host, portText] = text.split(":");
    const address = canonicalIp(host);
    const port = parsePort(portText);
    if (address === null || port === null) {
      return {
        ok: false,
        error: t("dnslookup.validate.badServer", { address: text }),
      };
    }
    return { ok: true, address: `${address}:${port}` };
  }

  const address = canonicalIp(text);
  if (address === null) {
    return {
      ok: false,
      error: t("dnslookup.validate.badServer", { address: text }),
    };
  }
  return { ok: true, address: `${address}:53` };
}

/** Порт в допустимом диапазоне или `null`. */
function parsePort(text: string): number | null {
  if (!/^\d{1,5}$/.test(text)) return null;
  const port = Number(text);
  return port >= 1 && port <= 65535 ? port : null;
}

/** Возвращает канонический IP или `null`, если это не адрес. */
function canonicalIp(text: string): string | null {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) {
    const octets = text.split(".").map(Number);
    return octets.every((octet) => octet <= 255) ? octets.join(".") : null;
  }

  if (!text.includes(":")) {
    return null;
  }

  try {
    const url = new URL(`http://[${text}]`);
    if (url.port !== "" || url.pathname !== "/" || url.search !== "" || url.hash !== "") {
      return null;
    }
    const host = url.hostname;
    return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : null;
  } catch {
    return null;
  }
}

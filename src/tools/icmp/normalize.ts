// Проверка цели Ping до добавления.
//
// Ядро принимает домен, IPv4, IPv6 и IPv6 со scope id. Интерфейс проверяет
// форму раньше: мусор вроде «!!!» не становится строкой таблицы, а отказ
// виден у поля. Проверка повторяет правила Rust, но не строже их: имя
// проходит те же пределы RFC, IDN переводится URL-парсером, как в DNSlookup.
//
// Отказ - код словаря и данные, а не готовая строка: правило проверки
// не зависит от механизма перевода и от Vue.

import type { MessageParams } from "@/core/infra/i18n/types";

/** Предел длины имени и метки по RFC. */
const MAX_NAME_LENGTH = 253;
const MAX_LABEL_LENGTH = 63;

/** Допустимые символы метки: подчёркивание встречается в служебных именах. */
const LABEL_PATTERN = /^[a-z0-9_-]+$/;

/** Результат проверки: цель годится или причина отказа. */
export type TargetInputResult = { ok: true } | { ok: false; code: string; params: MessageParams };

/**
 * Проверяет цель проверки: домен, IPv4, IPv6 или IPv6 со scope id.
 *
 * IP-литерал разбирается отдельно от имени: двоеточие без разобранного
 * адреса - почти наверняка опечатка, а не имя.
 */
export function parseTargetInput(input: string): TargetInputResult {
  const raw = input.trim();
  if (raw === "") {
    return { ok: false, code: "icmp.validate.emptyTarget", params: {} };
  }

  const literal = parseLiteral(raw);
  if (literal === true) return { ok: true };
  if (literal === false) {
    return { ok: false, code: "icmp.validate.badTarget", params: {} };
  }

  // Завершающая точка в имени не меняет смысл: Rust её отбрасывает.
  const display = raw.endsWith(".") ? raw.slice(0, -1) : raw;
  const name = toAscii(display);
  if (name === null || name.length > MAX_NAME_LENGTH) {
    return { ok: false, code: "icmp.validate.badTarget", params: {} };
  }

  for (const label of name.split(".")) {
    if (label === "" || label.length > MAX_LABEL_LENGTH || !LABEL_PATTERN.test(label)) {
      return { ok: false, code: "icmp.validate.badTarget", params: {} };
    }
  }

  return { ok: true };
}

/**
 * Разбирает IP-литерал.
 *
 * `true` - адрес принят, `false` - ввод похож на адрес, но испорчен,
 * `null` - это не адрес, а имя.
 */
function parseLiteral(raw: string): boolean | null {
  const unbracketed = raw.startsWith("[") && raw.endsWith("]") ? raw.slice(1, -1) : raw;

  const percent = unbracketed.indexOf("%");
  const address = percent === -1 ? unbracketed : unbracketed.slice(0, percent);
  const scope = percent === -1 ? null : unbracketed.slice(percent + 1);

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(address)) {
    const octets = address.split(".").map(Number);
    // У IPv4 не бывает scope id: «1.2.3.4%5» - не адрес.
    return scope === null && octets.every((octet) => octet <= 255);
  }

  if (!address.includes(":")) return null;
  if (!isIpv6(address)) return false;

  // Scope id у IPv6 числовой: имя интерфейса Rust не принимает.
  return scope === null || /^\d+$/.test(scope);
}

/** Проверяет форму IPv6 через разбор URL: он же нормализует адрес. */
function isIpv6(address: string): boolean {
  try {
    const url = new URL(`http://[${address}]`);
    return url.port === "" && url.pathname === "/" && url.search === "" && url.hash === "";
  } catch {
    return false;
  }
}

/** Переводит имя в ASCII-форму URL-парсером; `null` - имя не разобралось. */
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
  return url.hostname.endsWith(".") ? url.hostname.slice(0, -1) : url.hostname;
}

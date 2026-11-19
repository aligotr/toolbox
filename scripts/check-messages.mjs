// Полнота двух встроенных словарей (ADR 0039, ADR 0057).
//
// Русский - эталон ключей и форм: его пропуск валит сборку. Английский -
// второй встроенный язык: он обязан совпадать с русским по ключам,
// подстановкам и формам склонения своего языка. Внешние словари в сборке
// не проверяются: их состояние показывает раздел «Язык».
//
// Ключи собираются из `t("…")`, `titleKey`, `descriptionKey` и кодов
// журнала/ошибок: подписи разделов и записи передаются данными, а не
// вызываются напрямую.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { ruMessages } from "../src/core/infra/i18n/messages.ts";
import { enMessages } from "../src/core/infra/i18n/messages.en.ts";
import { pluralCategories } from "../src/core/infra/i18n/locale.ts";

const root = path.resolve(import.meta.dirname, "..");
const src = path.join(root, "src");

/** Подстановка словаря: `{name}`. */
const PLACEHOLDER = /\{(\w+)\}/g;

/** Категории склонения русского эталона: по ним проверяется полнота форм. */
const REFERENCE_CATEGORIES = pluralCategories("ru");

/** Строк для перечня в выводе: полный список заслоняет остальные замечания. */
const LIST_LIMIT = 12;

/** Формы, которыми ключ попадает в код. */
const KEY_PATTERNS = [
  /\bt\(\s*"([^"]+)"/g,
  /\bt\(\s*'([^']+)'/g,
  /titleKey:\s*"([^"]+)"/g,
  /descriptionKey:\s*"([^"]+)"/g,
  /nameKey:\s*"([^"]+)"/g,
  // Код ошибки, уведомления или записи журнала, созданной в интерфейсе.
  /code:\s*"((?:errors|settings|journal|notifications|dnslookup)\.[^"]+)"/g,
  // Запись журнала передаётся позиционно, а не объектом.
  /\bwrite\(\s*[^,]+,\s*"(?:info|result|error)",\s*"([^"]+)"/g,
  // Код отказа обёртки пресетов: он же ключ словаря.
  /\b(?:attempt|presetAction)\(\s*"((?:journal)\.[^"]+)"/g,
];

/** Все исходники интерфейса. */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|vue)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Коды ошибок и уведомлений ядра: Rust присылает код, интерфейс переводит. */
function walkRust(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walkRust(full, out);
    else if (entry.endsWith(".rs")) out.push(full);
  }
  return out;
}

/** Тексты сообщения: строка или набор форм склонения. */
function messageTexts(message) {
  if (typeof message === "string") return [message];
  if (!message || typeof message !== "object") return [];
  return Object.values(message).filter((text) => typeof text === "string");
}

/** Имена подстановок сообщения: для набора форм - объединение. */
function placeholderNames(message) {
  const names = new Set();
  for (const text of messageTexts(message)) {
    for (const match of text.matchAll(PLACEHOLDER)) names.add(match[1]);
  }
  return names;
}

/**
 * Формы склонения, которых не хватает языку.
 *
 * Набор задаёт `Intl.PluralRules`, а не привычка: английскому хватает
 * `one` и `other`, русскому нужны ещё `few` и `many`. Пропущенная форма -
 * такой же пропуск, как отсутствующий ключ.
 */
function missingForms(message, categories) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return categories;
  }
  return categories.filter((category) => typeof message[category] !== "string");
}

/** Печатает перечень с пределом: полный список не нужен в выводе сборки. */
function printLimited(prefix, items, describe = (item) => item) {
  for (const item of items.slice(0, LIST_LIMIT)) {
    console.warn(`  ${prefix}${describe(item)}`);
  }
  if (items.length > LIST_LIMIT) {
    console.warn(`  … и ещё ${items.length - LIST_LIMIT}`);
  }
}

/** Проверяет встроенный словарь против русского эталона. */
function checkBuiltin(code, messages) {
  const categories = pluralCategories(code);
  const keys = Object.keys(ruMessages);
  const missing = keys.filter((key) => !Object.hasOwn(messages, key));
  const extra = Object.keys(messages).filter((key) => !Object.hasOwn(ruMessages, key));

  const broken = [];
  for (const key of keys) {
    if (!Object.hasOwn(messages, key)) continue;
    const expected = placeholderNames(ruMessages[key]);
    const actual = placeholderNames(messages[key]);
    const lost = [...expected].filter((name) => !actual.has(name));
    const added = [...actual].filter((name) => !expected.has(name));
    const forms =
      typeof ruMessages[key] === "object" ? missingForms(messages[key], categories) : [];
    if (lost.length > 0 || added.length > 0 || forms.length > 0) {
      broken.push({ key, lost, added, forms });
    }
  }

  if (missing.length === 0 && extra.length === 0 && broken.length === 0) {
    console.log(`Словарь «${code}» полон: ${keys.length} ключей.`);
    return true;
  }

  console.error(`Словарь «${code}» не полон (ADR 0039, ADR 0057):`);
  if (missing.length > 0) {
    console.error(`  нет ключей: ${missing.length}`);
    printLimited("- ", missing);
  }
  if (extra.length > 0) {
    console.error(`  лишние ключи (в русском их нет): ${extra.length}`);
    printLimited("+ ", extra);
  }
  if (broken.length > 0) {
    console.error(`  расходятся подстановки или формы: ${broken.length}`);
    printLimited(
      "",
      broken,
      ({ key, lost, added, forms }) =>
        `${key}: ` +
        [
          lost.length > 0 ? `нет {${lost.join("}, {")}}` : "",
          added.length > 0 ? `лишняя {${added.join("}, {")}}` : "",
          forms.length > 0 ? `нет форм ${forms.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join(", "),
    );
  }
  return false;
}

/** Ключ → файл, в котором он используется. */
const used = new Map();

for (const file of walk(src)) {
  const text = readFileSync(file, "utf8");
  const relative = path.relative(root, file).replaceAll("\\", "/");

  for (const pattern of KEY_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      if (!used.has(match[1])) used.set(match[1], relative);
    }
  }
}

// Код ошибки или уведомления передаётся переменной, поэтому в `t("…")`
// его не видно: источник - строковый литерал в ядре.
for (const file of walkRust(path.join(root, "src-tauri", "src"))) {
  const text = readFileSync(file, "utf8");
  const relative = path.relative(root, file).replaceAll("\\", "/");

  for (const match of text.matchAll(/"(?:errors|notifications)\.[\w.]+"/g)) {
    const key = match[0].slice(1, -1);
    if (!used.has(key)) used.set(key, relative);
  }
}

const missing = [...used].filter(([key]) => !Object.hasOwn(ruMessages, key));

if (missing.length > 0) {
  console.error("В русском словаре нет используемых ключей (ADR 0039):");
  for (const [key, file] of missing) console.error(`  ${key} - ${file}`);
  process.exit(1);
}

// Формы склонения эталона проверяются так же строго, как ключи: набор форм -
// часть контракта, по нему строятся переводы и считается полнота.
const incompleteForms = Object.entries(ruMessages)
  .filter(([, message]) => typeof message === "object")
  .map(([key, message]) => ({ key, forms: missingForms(message, REFERENCE_CATEGORIES) }))
  .filter(({ forms }) => forms.length > 0);

if (incompleteForms.length > 0) {
  console.error("В русском словаре не хватает форм склонения (ADR 0039):");
  for (const { key, forms } of incompleteForms) {
    console.error(`  ${key}: нет ${forms.join(", ")}`);
  }
  process.exit(1);
}

const unused = Object.keys(ruMessages).filter((key) => !used.has(key));

if (unused.length > 0) {
  // Мусор не ломает работу: ключ мог понадобиться динамической подстановке.
  console.warn(`Русский словарь содержит неиспользуемые ключи: ${unused.length}`);
  for (const key of unused) console.warn(`  ${key}`);
}

console.log(`Русский словарь полон: ${used.size} ключей.`);

if (!checkBuiltin("en", enMessages)) process.exit(1);

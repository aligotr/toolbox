// Полнота русского словаря и состояние внешних словарей (ADR 0039).
//
// Русский встроен и обязан быть полным: ключ, который используется в коде,
// но которого нет в словаре, — это текст, который пользователь увидит как
// `settings.section.log`. Остальные словари могут отставать: их неполнота
// показывается в разделе «Язык», а не валит сборку.
//
// Ключи собираются из `t("…")` и из `titleKey`, потому что подписи разделов
// передаются данными, а не вызываются напрямую.
//
// Внешние словари проверяются здесь же: пропуск ключа и расхождение
// подстановок — предупреждения сборки, а не отказ. Русский остаётся
// единственным, чей пропуск останавливает сборку.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { ruMessages } from "../src/core/infra/i18n/messages.ts";

const root = path.resolve(import.meta.dirname, "..");
const src = path.join(root, "src");
const dictionaries = path.join(root, "src-tauri", "resources", "languages");

/** Подстановка словаря: `{name}`. */
const PLACEHOLDER = /\{(\w+)\}/g;

/** Строк для перечня в выводе: полный список заслоняет остальные замечания. */
const LIST_LIMIT = 12;

/** Формы, которыми ключ попадает в код. */
const KEY_PATTERNS = [
  /\bt\(\s*"([^"]+)"/g,
  /\bt\(\s*'([^']+)'/g,
  /titleKey:\s*"([^"]+)"/g,
  /descriptionKey:\s*"([^"]+)"/g,
  // Код ошибки или записи журнала, созданной в интерфейсе (ADR 0039).
  /code:\s*"((?:errors|settings|journal|dnslookup)\.[^"]+)"/g,
  // Запись журнала передаётся позиционно, а не объектом.
  /\bwrite(?:Once)?\(\s*[^,]+,\s*"(?:info|result|error)",\s*"([^"]+)"/g,
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

/** Коды ошибок ядра: Rust присылает код, интерфейс переводит его по словарю. */
function walkRust(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walkRust(full, out);
    else if (entry.endsWith(".rs")) out.push(full);
  }
  return out;
}

/** Убирает комментарии JSONC: вне строк они не часть данных. */
function removeComments(text) {
  let out = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const symbol = text[index];

    if (quoted) {
      out += symbol;
      if (symbol === "\\") {
        out += text[index + 1] ?? "";
        index += 1;
      } else if (symbol === '"') {
        quoted = false;
      }
      continue;
    }

    if (symbol === '"') {
      quoted = true;
      out += symbol;
      continue;
    }

    if (symbol === "/" && text[index + 1] === "/") {
      while (index < text.length && text[index] !== "\n") index += 1;
      out += "\n";
      continue;
    }

    if (symbol === "/" && text[index + 1] === "*") {
      index += 2;
      while (index < text.length && !(text[index] === "*" && text[index + 1] === "/")) {
        index += 1;
      }
      index += 1;
      continue;
    }

    out += symbol;
  }

  return out;
}

/** Убирает висячие запятые: их допускает диалект словарей. */
function removeTrailingCommas(text) {
  let out = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const symbol = text[index];

    if (quoted) {
      out += symbol;
      if (symbol === "\\") {
        out += text[index + 1] ?? "";
        index += 1;
      } else if (symbol === '"') {
        quoted = false;
      }
      continue;
    }

    if (symbol === '"') {
      quoted = true;
      out += symbol;
      continue;
    }

    if (symbol === ",") {
      let next = index + 1;
      while (next < text.length && /\s/.test(text[next])) next += 1;
      if (text[next] === "}" || text[next] === "]") continue;
    }

    out += symbol;
  }

  return out;
}

/** Разбирает словарь тем же диалектом, что читает ядро. */
function parseDictionary(text) {
  const plain = removeTrailingCommas(removeComments(text.replace(/^\uFEFF/, "")));
  return JSON.parse(plain);
}

/** Тексты сообщения: строка или набор форм склонения. */
function messageTexts(message) {
  if (typeof message === "string") return [message];
  if (!message || typeof message !== "object") return [];
  return Object.values(message).filter((text) => typeof text === "string");
}

/** Имена подстановок сообщения: для набора форм — объединение. */
function placeholderNames(message) {
  const names = new Set();
  for (const text of messageTexts(message)) {
    for (const match of text.matchAll(PLACEHOLDER)) names.add(match[1]);
  }
  return names;
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

/**
 * Проверяет внешний словарь и печатает замечания.
 *
 * Замечание не останавливает сборку: словарь правит пользователь, и его
 * неполнота — состояние файла, а не дефект кода. Пропущенный ключ при этом
 * виден в интерфейсе: показывается русская формулировка.
 */
function checkDictionary(file) {
  const code = path.basename(file, ".json");

  let document;
  try {
    document = parseDictionary(readFileSync(file, "utf8"));
  } catch (error) {
    console.warn(`Словарь «${code}» не разобран: ${error.message}`);
    return;
  }

  const messages = document?.messages;
  if (!messages || typeof messages !== "object" || Array.isArray(messages)) {
    console.warn(`Словарь «${code}»: поле «messages» должно быть объектом.`);
    return;
  }

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
    if (lost.length > 0 || added.length > 0) broken.push({ key, lost, added });
  }

  if (missing.length === 0 && extra.length === 0 && broken.length === 0) {
    console.log(`Словарь «${code}»: переведён полностью (${keys.length} ключей).`);
    return;
  }

  console.warn(`Словарь «${code}»: переведён не полностью.`);
  if (missing.length > 0) {
    console.warn(`  нет ключей: ${missing.length}`);
    printLimited("- ", missing);
  }
  if (extra.length > 0) {
    console.warn(`  лишние ключи (в русском их нет): ${extra.length}`);
    printLimited("+ ", extra);
  }
  if (broken.length > 0) {
    console.warn(`  расходятся подстановки: ${broken.length}`);
    printLimited(
      "",
      broken,
      ({ key, lost, added }) =>
        `${key}: ` +
        [
          lost.length > 0 ? `нет {${lost.join("}, {")}}` : "",
          added.length > 0 ? `лишняя {${added.join("}, {")}}` : "",
        ]
          .filter(Boolean)
          .join(", "),
    );
  }
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

// Код ошибки передаётся переменной, поэтому в `t("…")` его не видно:
// источник — строковый литерал `errors.…` в ядре.
for (const file of walkRust(path.join(root, "src-tauri", "src"))) {
  const text = readFileSync(file, "utf8");
  const relative = path.relative(root, file).replaceAll("\\", "/");

  for (const match of text.matchAll(/"errors\.[\w.]+"/g)) {
    const key = match[0].slice(1, -1);
    if (!used.has(key)) used.set(key, relative);
  }
}

const missing = [...used].filter(([key]) => !Object.hasOwn(ruMessages, key));

if (missing.length > 0) {
  console.error("В русском словаре нет используемых ключей (ADR 0039):");
  for (const [key, file] of missing) console.error(`  ${key} — ${file}`);
  process.exit(1);
}

const unused = Object.keys(ruMessages).filter((key) => !used.has(key));

if (unused.length > 0) {
  // Мусор не ломает работу: ключ мог понадобиться динамической подстановке.
  console.warn(`Русский словарь содержит неиспользуемые ключи: ${unused.length}`);
  for (const key of unused) console.warn(`  ${key}`);
}

console.log(`Русский словарь полон: ${used.size} ключей.`);

if (existsSync(dictionaries)) {
  const files = readdirSync(dictionaries)
    .filter((entry) => entry.endsWith(".json"))
    .sort()
    .map((entry) => path.join(dictionaries, entry));

  for (const file of files) checkDictionary(file);
}

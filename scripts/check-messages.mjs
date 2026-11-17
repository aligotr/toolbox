// Полнота русского словаря (ADR 0039).
//
// Русский встроен и обязан быть полным: ключ, который используется в коде,
// но которого нет в словаре, — это текст, который пользователь увидит как
// `settings.section.log`. Остальные словари могут отставать: их неполнота
// показывается в разделе «Язык», а не валит сборку.
//
// Ключи собираются из `t("…")` и из `titleKey`, потому что подписи разделов
// передаются данными, а не вызываются напрямую.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { ruMessages } from "../src/core/infra/i18n/messages.ts";

const root = path.resolve(import.meta.dirname, "..");
const src = path.join(root, "src");

/** Формы, которыми ключ попадает в код. */
const KEY_PATTERNS = [
  /\bt\(\s*"([^"]+)"/g,
  /\bt\(\s*'([^']+)'/g,
  /titleKey:\s*"([^"]+)"/g,
  /descriptionKey:\s*"([^"]+)"/g,
  // Код ошибки, созданной в интерфейсе: он же ключ словаря (ADR 0039).
  /code:\s*"((?:errors|settings)\.[^"]+)"/g,
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

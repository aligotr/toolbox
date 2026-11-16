// Стражи границ зон интерфейса (ADR 0035).
//
// Проверка читает импорты, потому что TypeScript сам стрелку вверх не
// запрещает. Правила те же, что у Rust: инфраструктура не знает доменов,
// контракты остаются словарём обмена без поведения.
//
// Скрипт запускается перед сборкой: граница, которая держится только
// документом, расходится с кодом за пару месяцев.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const src = path.join(root, "src");

/** Все исходники интерфейса. */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|vue)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Путь файла в терминах `src/...` без расширения. */
function key(file) {
  return path
    .relative(root, file)
    .replaceAll("\\", "/")
    .replace(/\.(ts|vue)$/, "");
}

/** Импорты файла: только относительные, внешние пакеты не наши.
 *
 * Ловятся обе формы: `from "./x"` и побочный `import "./x"`.
 */
const SPECIFIERS = [
  /\b(?:from|import)\s+"(\.[^"]*)"/g,
  /\bimport\s*\(\s*"(\.[^"]*)"\s*\)/g,
];

function imports(file) {
  const text = readFileSync(file, "utf8");
  const found = [];
  for (const pattern of SPECIFIERS) {
    for (const match of text.matchAll(pattern)) {
      const target = path
        .relative(root, path.resolve(path.dirname(file), match[1]))
        .replaceAll("\\", "/");
      found.push({ target, statement: match[0] });
    }
  }
  return found;
}

/** Лежит ли путь в зоне: `src/core/services` или `src/core/services/x.ts`. */
function inZone(target, zone) {
  return target === zone || target.startsWith(`${zone}/`);
}

/** Признаки поведения в контрактах: объявление или реэкспорт значения.
 *
 * Реэкспорт типов (`export type { ... } from`) разрешён: это по-прежнему
 * словарь, а не реализация.
 */
const BEHAVIOUR = [
  /\bexport\s+(?:default\b|(?:async\s+)?function\b|class\b|abstract\s+class\b|const\b|let\b|var\b|enum\b)/,
  /\bexport\s*\{(?!\s*type\b)[^}]*\}\s*from\b/,
];

const violations = [];

for (const file of walk(src)) {
  const self = key(file);
  const text = readFileSync(file, "utf8");

  // Контракты — только типы: поведение принадлежит домену.
  if (inZone(self, "src/contracts")) {
    if (BEHAVIOUR.some((pattern) => pattern.test(text))) {
      violations.push(`${self}: контракты не содержат поведения — перенесите код в домен`);
    }
  }

  for (const { target } of imports(file)) {
    // Инфраструктура не знает ни доменов, ни общих подписей оболочки.
    if (inZone(self, "src/core/infra")) {
      if (inZone(target, "src/core/services")) {
        violations.push(`${self} → ${target}: инфраструктура не знает доменов`);
      }
      if (inZone(target, "src/core/constants")) {
        violations.push(`${self} → ${target}: константа оболочки не принадлежит инфраструктуре`);
      }
    }

    // Ядро не знает ни оболочки, ни инструментов, ни сборки.
    if (inZone(self, "src/core")) {
      for (const zone of ["src/shell", "src/tools", "src/app", "src/ui"]) {
        if (inZone(target, zone)) {
          violations.push(`${self} → ${target}: ядро не знает слоя выше`);
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error("Нарушены границы зон (ADR 0035):");
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log("Границы зон в порядке.");

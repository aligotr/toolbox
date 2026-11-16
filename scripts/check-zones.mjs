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

/** Импорты файла: относительные, через алиас `@/` и пакетные.
 *
 * Ловятся обе формы записи: `from "./x"` и побочный `import "./x"`. Алиас
 * `@/` указывает на `src/`, поэтому межслойный импорт не должен проскакивать
 * мимо стража. Пакеты нужны контрактам: им запрещён стек Vue и Tauri.
 */
const SPECIFIERS = [
  /\b(?:from|import)\s+"([^"]+)"/g,
  /\bimport\s*\(\s*"([^"]+)"\s*\)/g,
];

/** Путь цели импорта в терминах `src/...`; пакет остаётся своим именем. */
function resolveSpecifier(file, specifier) {
  if (specifier.startsWith("@/")) return `src/${specifier.slice(2)}`;
  if (!specifier.startsWith(".")) return specifier;
  return path
    .relative(root, path.resolve(path.dirname(file), specifier))
    .replaceAll("\\", "/");
}

function imports(file) {
  const text = readFileSync(file, "utf8");
  const found = [];
  for (const pattern of SPECIFIERS) {
    for (const match of text.matchAll(pattern)) {
      found.push({ target: resolveSpecifier(file, match[1]), statement: match[0] });
    }
  }
  return found;
}

/** Лежит ли путь в зоне: `src/core/services` или `src/core/services/x.ts`. */
function inZone(target, zone) {
  return target === zone || target.startsWith(`${zone}/`);
}

/** Слой файла по пути `src/<слой>/...`; `null` — стили и прочее вне слоёв. */
function layerOf(target) {
  const [head] = target.replace(/^src\//, "").split("/");
  const layers = ["contracts", "core", "ui", "tools", "workbench", "app"];
  return layers.includes(head) ? head : null;
}

/** Инструмент по пути `src/tools/<id>/...`; `null` — не инструмент. */
function toolOf(target) {
  return target.startsWith("src/tools/") ? (target.split("/")[2] ?? null) : null;
}

/** Слои, которые заявленный слой не импортирует: зависимости идут вниз. */
const UPWARD = {
  contracts: ["core", "ui", "tools", "workbench", "app"],
  ui: ["tools", "workbench", "app"],
  tools: ["workbench", "app"],
  workbench: ["tools", "app"],
};

/** Пакеты, которых не должно быть в контрактах: словарь без стека. */
const CONTRACT_PACKAGES = ["vue", "@vue/", "@tauri-apps/"];

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
  const selfLayer = layerOf(self);
  const selfTool = toolOf(self);

  // Контракты — только типы: поведение принадлежит домену.
  if (inZone(self, "src/contracts")) {
    if (BEHAVIOUR.some((pattern) => pattern.test(text))) {
      violations.push(`${self}: контракты не содержат поведения — перенесите код в домен`);
    }
  }

  for (const { target } of imports(file)) {
    // Контракты: только свои типы и никакого стека — тип компонента
    // передаётся параметром, а не импортом Vue.
    if (selfLayer === "contracts") {
      const other = layerOf(target);
      if (other && other !== "contracts") {
        violations.push(`${self} → ${target}: контракты импортируют только контракты`);
      }
      if (CONTRACT_PACKAGES.some((name) => target === name || target.startsWith(name))) {
        violations.push(`${self} → ${target}: контракты не импортируют Vue и Tauri`);
      }
    } else if (selfLayer && UPWARD[selfLayer]?.includes(layerOf(target))) {
      violations.push(
        `${self} → ${target}: слой «${selfLayer}» не импортирует слой «${layerOf(target)}»`,
      );
    }

    // Инструменты не знают друг о друге: общий код опускается в core или ui.
    const otherTool = toolOf(target);
    if (selfTool && otherTool && selfTool !== otherTool) {
      violations.push(`${self} → ${target}: инструменты не импортируют друг друга`);
    }

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
      for (const zone of ["src/workbench", "src/tools", "src/app", "src/ui"]) {
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

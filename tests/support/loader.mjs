// Загрузчик тестов: резолвит импорты так же, как сборка.
//
// Источники ссылаются друг на друга без расширений и через `@/`, а Node
// такие пути не разрешает. Тесты держателей состояния импортируют Vue:
// берётся настоящая сборка, а не заглушка, — иначе тест проверял бы фейк.
//
// Фейки Tauri подменяют только внешнюю систему (команды, события, окно):
// её в Node нет, а бизнес-логика ядра участвует в тесте как есть.

import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../..");
const src = path.join(root, "src");

/** Сборка Vue без компилятора шаблонов: тестам хватает реактивности. */
const VUE_ESM = pathToFileURL(
  path.join(root, "node_modules/vue/dist/vue.runtime.esm-bundler.js"),
).href;

/** Флаги esm-bundler сборки: без них модуль падает на свободных переменных. */
globalThis.__DEV__ = false;
globalThis.__FEATURE_OPTIONS_API__ = true;
globalThis.__FEATURE_PROD_DEVTOOLS__ = false;
globalThis.__FEATURE_SUSPENSE__ = true;

/** Пакеты Tauri и их фейки: каталог считается внешней системой. */
const TAURI = new Map([
  ["@tauri-apps/api/core", "tests/support/fakes/core.mjs"],
  ["@tauri-apps/api/event", "tests/support/fakes/event.mjs"],
  ["@tauri-apps/api/window", "tests/support/fakes/window.mjs"],
]);

/** Есть ли файл по этому пути. */
function isFile(candidate) {
  return existsSync(candidate) && statSync(candidate).isFile();
}

/** Первый существующий вариант пути: сам файл, `.ts`, `.mjs` или `index.ts`. */
function firstFile(target) {
  return [target, `${target}.ts`, `${target}.mjs`, path.join(target, "index.ts")].find(isFile);
}

/** Путь, на который указывает спецификатор, или `null` для пакетов. */
function targetOf(specifier, parentURL) {
  if (specifier.startsWith("@/")) return path.join(src, specifier.slice(2));
  if (!specifier.startsWith(".") || !parentURL) return null;
  return path.resolve(path.dirname(fileURLToPath(parentURL)), specifier);
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "vue") {
      return { url: VUE_ESM, shortCircuit: true };
    }

    const fake = TAURI.get(specifier);
    if (fake) {
      return { url: pathToFileURL(path.join(root, fake)).href, shortCircuit: true };
    }

    const target = targetOf(specifier, context.parentURL);
    const file = target === null ? undefined : firstFile(target);
    if (!file) return nextResolve(specifier, context);

    return { url: pathToFileURL(file).href, shortCircuit: true };
  },
});

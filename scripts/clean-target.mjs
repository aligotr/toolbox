import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Чистка артефактов сборки Rust и Tauri.
//
// Запуск из корня проекта:
//   node scripts/clean-target.mjs                 предпросмотр
//   node scripts/clean-target.mjs --apply         удалить остатки
//   node scripts/clean-target.mjs --force         полная очистка и сборка
//   node scripts/clean-target.mjs --force --no-build
//                                                         только полная очистка
//
// Предпросмотр ничего не удаляет. Это защита от случайной потери
// инкрементальной сборки: сначала смотрим, что найдено, потом решаем.
//
// Что ищет скрипт:
// - каталог сборки: src-tauri/target или target;
// - каталоги .tmp*.temp-archive в deps: следы прерванной архивации на Windows.
//   Каждый такой каталог хранит почти готовый tmp.a размером 0,5-0,7 ГБ.
//
// Ключи:
//   --apply     удалить только остатки прерванных сборок;
//   --all       полная очистка через cargo clean (вместе с --apply);
//   --force     полная очистка через cargo clean и пересборка debug;
//   --no-build  не пересобирать после --force;
//   --help      справка.
//
// Порог предупреждения задан константами ниже. Без ключей скрипт ничего
// не удаляет и не запускает сборку.

const root = process.cwd();
const apply = process.argv.includes("--apply");
const all = process.argv.includes("--all");
const force = process.argv.includes("--force");
const noBuild = process.argv.includes("--no-build");
const help = process.argv.includes("--help") || process.argv.includes("-h");

// Порог, после которого пора чистить.
const WARN_TOTAL_GB = 15;
const WARN_TEMP_COUNT = 5;
const WARN_TEMP_GB = 5;

const TEMP_ARCHIVE = /^\.tmp.*\.temp-archive$/i;

function formatSize(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2).replace(".", ",")} ГБ`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1).replace(".", ",")} МБ`;
  return `${(bytes / 1024).toFixed(0)} КБ`;
}

// Размер каталога без перехода по символическим ссылкам.
function sizeOf(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += sizeOf(full);
    else if (entry.isFile()) {
      try {
        total += statSync(full).size;
      } catch {
        // Файл мог исчезнуть между чтением каталога и stat.
      }
    }
  }
  return total;
}

// Каталог сборки: сначала Tauri, затем обычный Rust.
function findTarget() {
  for (const candidate of ["src-tauri/target", "target"]) {
    const full = path.join(root, candidate);
    if (existsSync(full)) return { relative: candidate, full };
  }
  return null;
}

// Манифест нужен для cargo clean и cargo build.
function findManifest() {
  for (const candidate of ["src-tauri/Cargo.toml", "Cargo.toml"]) {
    const full = path.join(root, candidate);
    if (existsSync(full)) return candidate;
  }
  return null;
}

// Сбор каталогов .tmp*.temp-archive. Внутрь найденного каталога не заходим:
// он весь подлежит удалению, а размер считаем отдельно.
function findTempArchives(dir, found) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (TEMP_ARCHIVE.test(entry.name)) found.push(full);
    else findTempArchives(full, found);
  }
}

// Профили верхнего уровня: debug, release и прочие.
function profileSizes(targetDir) {
  const result = [];
  for (const entry of readdirSync(targetDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    result.push({ name: entry.name, size: sizeOf(path.join(targetDir, entry.name)) });
  }
  return result.sort((a, b) => b.size - a.size);
}

function printHelp() {
  console.log("Чистка артефактов сборки.");
  console.log("");
  console.log("  node scripts/clean-target.mjs                 предпросмотр");
  console.log("  node scripts/clean-target.mjs --apply         удалить остатки прерванных сборок");
  console.log("  node scripts/clean-target.mjs --force         полная очистка и сборка");
  console.log("  node scripts/clean-target.mjs --force --no-build");
  console.log("                                                        только полная очистка");
  console.log("");
  console.log(`Порог предупреждения: ${WARN_TOTAL_GB} ГБ, остатков: ${WARN_TEMP_COUNT} каталогов.`);
}

function removeDirectories(dirs) {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
}

function cargoPath() {
  return process.platform === "win32" ? "cargo.exe" : "cargo";
}

function runCargo(args) {
  const cargo = cargoPath();
  console.log(`Запуск: ${cargo} ${args.join(" ")}`);
  const result = spawnSync(cargo, args, { cwd: root, stdio: "inherit" });
  if (result.error) {
    console.error(`Не удалось запустить cargo: ${result.error.message}`);
    return false;
  }
  if (result.status !== 0) {
    console.error(`cargo завершился с кодом ${result.status}.`);
    return false;
  }
  return true;
}

// Полная очистка: cargo clean, если есть манифест, иначе удаление самого
// каталога сборки. После этого убираются остатки, которые cargo не знает.
function cleanEverything(target, manifest) {
  if (manifest) {
    if (!runCargo(["clean", "--manifest-path", manifest])) return false;
  } else {
    console.log("Cargo.toml не найден: удаляю содержимое каталога сборки.");
    for (const entry of readdirSync(target.full, { withFileTypes: true })) {
      rmSync(path.join(target.full, entry.name), { recursive: true, force: true });
    }
    return true;
  }
  // cargo clean может удалить каталог сборки целиком.
  if (!existsSync(target.full)) return true;
  const leftovers = [];
  findTempArchives(target.full, leftovers);
  removeDirectories(leftovers);
  const flycheck = path.join(target.full, "flycheck0");
  if (existsSync(flycheck)) rmSync(flycheck, { recursive: true, force: true });
  return true;
}

// Размер каталога сборки с учётом того, что cargo clean мог его удалить.
function currentSize(target) {
  return existsSync(target.full) ? sizeOf(target.full) : 0;
}

if (help) {
  printHelp();
  process.exit(0);
}

const target = findTarget();
const manifest = findManifest();

if (!target) {
  console.log("Каталог сборки не найден: нет src-tauri/target и target.");
  if (force && manifest && !noBuild) {
    if (!runCargo(["build", "--manifest-path", manifest])) process.exit(1);
    const rebuilt = path.join(root, path.dirname(manifest), "target");
    console.log(
      `Готово. Сборка с нуля, размер: ${formatSize(existsSync(rebuilt) ? sizeOf(rebuilt) : 0)}.`,
    );
  }
  process.exit(0);
}

const profiles = profileSizes(target.full);
const totalSize = profiles.reduce((sum, item) => sum + item.size, 0);
const tempArchives = [];
findTempArchives(target.full, tempArchives);
const tempSize = tempArchives.reduce((sum, dir) => sum + sizeOf(dir), 0);

console.log(`Каталог сборки: ${target.relative}`);
console.log(`Всего: ${formatSize(totalSize)}`);
for (const profile of profiles) console.log(`  ${profile.name}: ${formatSize(profile.size)}`);
console.log("");
console.log(`Остатки прерванных сборок: ${tempArchives.length} каталогов, ${formatSize(tempSize)}`);
for (const dir of tempArchives.slice(0, 10)) {
  console.log(`  ${path.relative(target.full, dir)}  ${formatSize(sizeOf(dir))}`);
}
if (tempArchives.length > 10) console.log(`  ... ещё ${tempArchives.length - 10}`);

const tooBig = totalSize / 1024 ** 3 > WARN_TOTAL_GB;
const tooManyTemp = tempArchives.length > WARN_TEMP_COUNT || tempSize / 1024 ** 3 > WARN_TEMP_GB;

if (tooBig || tooManyTemp) {
  console.log("");
  console.log("Пора чистить: превышен порог размера или накопились остатки сборок.");
}

if (force) {
  console.log("");
  if (!cleanEverything(target, manifest)) process.exit(1);
  if (noBuild) {
    console.log(`Готово. Осталось: ${formatSize(currentSize(target))}.`);
    process.exit(0);
  }
  if (!manifest) {
    console.error("Не найден Cargo.toml: пересборка невозможна.");
    process.exit(1);
  }
  if (!runCargo(["build", "--manifest-path", manifest])) process.exit(1);
  console.log("");
  console.log(`Готово. Сборка с нуля, размер: ${formatSize(currentSize(target))}.`);
  process.exit(0);
}

if (!apply) {
  console.log("");
  console.log("Предпросмотр: ничего не удалено.");
  console.log("Удалить остатки: node scripts/clean-target.mjs --apply");
  console.log("Полная очистка и сборка: node scripts/clean-target.mjs --force");
  process.exit(0);
}

if (all) {
  if (!cleanEverything(target, manifest)) process.exit(1);
  console.log(`Готово. Осталось: ${formatSize(currentSize(target))}.`);
  process.exit(0);
}

removeDirectories(tempArchives);
console.log("");
console.log(`Удалено каталогов: ${tempArchives.length}, освобождено: ${formatSize(tempSize)}.`);
console.log(`Осталось: ${formatSize(currentSize(target))}.`);

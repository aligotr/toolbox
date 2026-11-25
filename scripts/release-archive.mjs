import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

// Сборка релизного архива ToolBox.
//
// Запуск из корня проекта:
//   node scripts/release-archive.mjs              собрать архив и обновить хеши
//   node scripts/release-archive.mjs --build      сначала пересобрать exe
//   node scripts/release-archive.mjs --check      проверить готовый архив
//   node scripts/release-archive.mjs --no-notes   не трогать RELEASE.md
//   node scripts/release-archive.mjs --help       справка
//
// Что делает сборка:
// 1. Сверяет версию в package.json, Cargo.toml и tauri.conf.json.
// 2. Берёт `src-tauri/target/release/ToolBox.exe`, `LICENSE` и шаблон
//    `scripts/release-readme.txt`; подставляет в шаблон версию и хеш exe.
// 3. Собирает `release/ToolBox_v<версия>.zip`: файлы лежат в корне архива,
//    без вложенной папки.
// 4. Пишет `release/SHA256SUMS.txt` и обновляет хеши в `RELEASE.md`.
// 5. Проверяет готовый архив тем же разбором, что и ключ `--check`.
//
// Шаблон README отслеживается git, а `release/` - нет: сгенерированные
// файлы живут только на машине сборки.
//
// Архив воспроизводим: записи идут по имени, дата внутри фиксированная,
// сжатие level 9. Хеш совпадёт при той же версии Node: сжатие zlib может
// отличаться между версиями.

const root = process.cwd();
const exeFile = path.join(root, "src-tauri/target/release/ToolBox.exe");
const licenseFile = path.join(root, "LICENSE");
const templateFile = path.join(root, "scripts/release-readme.txt");
const notesFile = path.join(root, "RELEASE.md");
const releaseDir = path.join(root, "release");
const stagingDir = path.join(releaseDir, "ToolBox");
const sumsFile = path.join(releaseDir, "SHA256SUMS.txt");
const packageFile = path.join(root, "package.json");
const cargoFile = path.join(root, "src-tauri/Cargo.toml");
const tauriFile = path.join(root, "src-tauri/tauri.conf.json");

const args = process.argv.slice(2);
const check = args.includes("--check");
const build = args.includes("--build");
const noNotes = args.includes("--no-notes");
const help = args.includes("--help") || args.includes("-h");

// Байт порядка метки UTF-8: старый Блокнот без него читает файл как ANSI
// и портит кириллицу.
const BOM = "\uFEFF";

// Фиксированная дата записей архива: 1 января 1980 года.
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

const UTF8_FLAG = 0x0800;
const STORE = 0;
const DEFLATE = 8;
const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function formatSize(bytes) {
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2).replace(".", ",")} МБ`;
  return `${(bytes / 1024).toFixed(0)} КБ`;
}

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function readText(file) {
  return readFileSync(file, "utf8");
}

// Версия одна во всех манифестах: расхождение ломает имя архива и метаданные.
function readVersion() {
  const version = JSON.parse(readText(packageFile)).version;
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
    fail(`package.json: ожидается версия в формате год.месяц.номер, получено: ${version}`);
  }

  const cargoVersion = readText(cargoFile).match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  if (cargoVersion !== version) {
    fail(`Версии расходятся: package.json ${version}, Cargo.toml ${cargoVersion}.`);
  }

  const tauriVersion = JSON.parse(readText(tauriFile)).version;
  if (tauriVersion !== version) {
    fail(`Версии расходятся: package.json ${version}, tauri.conf.json ${tauriVersion}.`);
  }

  return version;
}

function requireFile(file) {
  if (!existsSync(file)) fail(`Не найден ${rel(file)}.`);
  return file;
}

// Текст README архива: подстановки, затем проверка, что лишних не осталось.
function renderReadme(version, exeHash) {
  const template = readText(requireFile(templateFile));
  const text = template.replaceAll("{{version}}", version).replaceAll("{{exeSha256}}", exeHash);
  const leftover = text.match(/\{\{[a-zA-Z]+\}\}/);
  if (leftover) fail(`В ${rel(templateFile)} осталась подстановка ${leftover[0]}.`);
  return text;
}

function readmeBuffer(version, exeHash) {
  return Buffer.from(BOM + renderReadme(version, exeHash), "utf8");
}

// Сборка zip в памяти: локальные заголовки, затем центральный каталог.
function buildZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of [...files].sort((left, right) => left.name.localeCompare(right.name))) {
    const name = Buffer.from(file.name, "utf8");
    const deflated = deflateRawSync(file.data, { level: 9 });
    const store = deflated.length >= file.data.length;
    const body = store ? file.data : deflated;
    const method = store ? STORE : DEFLATE;
    const checksum = crc32(file.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_SIGNATURE, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_SIGNATURE, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(UTF8_FLAG, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);

    localParts.push(local, name, body);
    centralParts.push(central, name);
    offset += local.length + name.length + body.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_SIGNATURE, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

// Разбор архива для проверки: читаем центральный каталог и распаковываем
// записи тем же кодом, что и любой распаковщик.
function parseZip(buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) fail("Архив повреждён: нет конца центрального каталога.");

  const count = buffer.readUInt16LE(end + 10);
  let cursor = buffer.readUInt32LE(end + 16);
  const entries = [];

  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
      fail("Архив повреждён: неверная запись центрального каталога.");
    }
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);

    if (buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
      fail(`Архив повреждён: нет локального заголовка записи ${name}.`);
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);
    const data = method === DEFLATE ? inflateRawSync(raw) : Buffer.from(raw);

    if (crc32(data) !== buffer.readUInt32LE(cursor + 16)) {
      fail(`Архив повреждён: не сходится CRC записи ${name}.`);
    }

    entries.push({ name, data });
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function runBuild() {
  console.log("Сборка: npm run tauri build -- --no-bundle");
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const commandArgs =
    process.platform === "win32"
      ? ["/c", "npm run tauri build -- --no-bundle"]
      : ["run", "tauri", "build", "--", "--no-bundle"];
  const result = spawnSync(command, commandArgs, { cwd: root, stdio: "inherit" });

  if (result.error) fail(`Не удалось запустить сборку: ${result.error.message}`);
  if (result.status !== 0) fail(`Сборка завершилась с кодом ${result.status}.`);
  requireFile(exeFile);
}

// Состав архива и промежуточный каталог: одни и те же байты, чтобы копия
// рядом с архивом не расходилась с содержимым.
function prepareArchive(version) {
  const exe = readFileSync(requireFile(exeFile));
  const license = readFileSync(requireFile(licenseFile));
  const exeHash = sha256(exe);
  const readme = readmeBuffer(version, exeHash);
  const archiveName = `ToolBox_v${version}.zip`;
  const archiveFile = path.join(releaseDir, archiveName);

  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });
  writeFileSync(path.join(stagingDir, "ToolBox.exe"), exe);
  writeFileSync(path.join(stagingDir, "README.txt"), readme);
  writeFileSync(path.join(stagingDir, "LICENSE"), license);

  mkdirSync(releaseDir, { recursive: true });
  const zip = buildZip([
    { name: "ToolBox.exe", data: exe },
    { name: "README.txt", data: readme },
    { name: "LICENSE", data: license },
  ]);
  writeFileSync(archiveFile, zip);

  return { archiveName, archiveFile, zipHash: sha256(zip), exeHash };
}

function writeSums(archiveName, zipHash, exeHash) {
  writeFileSync(sumsFile, `${zipHash}  ${archiveName}\n${exeHash}  ToolBox.exe\n`, "utf8");
}

// Замена блока release notes по известной подписи. Отсутствие подписи -
// ошибка: молча оставить старый хеш опаснее, чем остановиться.
function replaceHash(text, pattern, hash, label) {
  if (!pattern.test(text)) fail(`В ${rel(notesFile)} не найден блок: ${label}.`);
  return text.replace(pattern, `$1${hash}`);
}

function updateNotes(archiveName, zipHash, exeHash) {
  const original = readText(notesFile);
  if (!original.includes(`# ToolBox`)) fail(`В ${rel(notesFile)} нет заголовка релиза.`);

  let text = original.replace(/ToolBox_v\d+\.\d+\.\d+\.zip/g, archiveName);
  text = replaceHash(
    text,
    /(SHA256 архива:\r?\n\r?\n```text\r?\n)[0-9a-f]{64}/,
    zipHash,
    "SHA256 архива",
  );
  text = replaceHash(
    text,
    /(SHA256 `ToolBox\.exe` внутри архива:\r?\n\r?\n```text\r?\n)[0-9a-f]{64}/,
    exeHash,
    "SHA256 ToolBox.exe",
  );

  if (text === original) return false;
  writeFileSync(notesFile, text, "utf8");
  return true;
}

// Сверка готового архива: состав, содержимое, хеши и release notes.
function verifyArchive(version, options = {}) {
  const expectNotes = options.expectNotes ?? true;
  const archiveName = `ToolBox_v${version}.zip`;
  const archiveFile = path.join(releaseDir, archiveName);
  const zip = readFileSync(requireFile(archiveFile));
  const zipHash = sha256(zip);
  const entries = parseZip(zip);
  const byName = new Map(entries.map((entry) => [entry.name, entry.data]));
  const expected = ["LICENSE", "README.txt", "ToolBox.exe"];

  const names = entries.map((entry) => entry.name).sort();
  if (names.join("|") !== expected.join("|")) {
    fail(`Состав архива не совпал: ${names.join(", ")}.`);
  }

  const exeHash = sha256(byName.get("ToolBox.exe"));
  const expectedReadme = readmeBuffer(version, exeHash);
  if (!byName.get("README.txt").equals(expectedReadme)) {
    fail("README.txt в архиве расходится с шаблоном и хешем ToolBox.exe.");
  }
  if (!byName.get("LICENSE").equals(readFileSync(requireFile(licenseFile)))) {
    fail("LICENSE в архиве расходится с файлом репозитория.");
  }

  const sums = readText(requireFile(sumsFile));
  if (!sums.includes(zipHash) || !sums.includes(exeHash)) {
    fail(`${rel(sumsFile)}: хеши не совпадают с архивом.`);
  }

  if (expectNotes) {
    const notes = readText(notesFile);
    if (!notes.includes(archiveName)) fail(`${rel(notesFile)}: имя архива не совпадает.`);
    if (!notes.includes(zipHash)) fail(`${rel(notesFile)}: хеш архива не совпадает.`);
    if (!notes.includes(exeHash)) fail(`${rel(notesFile)}: хеш ToolBox.exe не совпадает.`);
  }

  return { archiveName, archiveFile, zipHash, exeHash, entries: names, size: zip.length };
}

function printReport(report) {
  console.log(`Архив: ${rel(report.archiveFile)}`);
  console.log(`Размер: ${formatSize(report.size)} (${report.size} байт)`);
  console.log(`Файлы: ${report.entries.join(", ")}`);
  console.log(`SHA256 архива: ${report.zipHash}`);
  console.log(`SHA256 ToolBox.exe: ${report.exeHash}`);
}

function printHelp() {
  console.log("Подготовка релизного архива ToolBox.");
  console.log("");
  console.log("  node scripts/release-archive.mjs              собрать архив и обновить хеши");
  console.log("  node scripts/release-archive.mjs --build      сначала пересобрать exe");
  console.log("  node scripts/release-archive.mjs --check      проверить готовый архив");
  console.log("  node scripts/release-archive.mjs --no-notes   не трогать RELEASE.md");
  console.log("");
  console.log("Сборка пишет release/ToolBox_v<версия>.zip, release/SHA256SUMS.txt");
  console.log("и хеши в RELEASE.md; проверка ничего не меняет.");
}

if (help) {
  printHelp();
  process.exit(0);
}

const version = readVersion();

if (check) {
  const report = verifyArchive(version);
  printReport(report);
  console.log("Проверка пройдена.");
  process.exit(0);
}

if (build) runBuild();

const { archiveName, zipHash, exeHash } = prepareArchive(version);
writeSums(archiveName, zipHash, exeHash);

const notesChanged = noNotes ? false : updateNotes(archiveName, zipHash, exeHash);
const report = verifyArchive(version, { expectNotes: !noNotes });

printReport(report);
console.log("Обновлено: release/SHA256SUMS.txt" + (notesChanged ? ", RELEASE.md" : ""));
console.log("Проверка пройдена.");

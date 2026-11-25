import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Проверка документации проекта.
//
// Запуск из корня проекта:
//   node .agents/auxiliary/scripts/node/check-docs.mjs
//   node .agents/auxiliary/scripts/node/check-docs.mjs --root <каталог> --json
// Вход: дерево .agents/, AGENTS.md и README.md.
// Выход: список проблем и код 1 либо число проверенных файлов и код 0.
// JSON: { files, problems, warnings } - для сверки реализаций на разных языках.
//
// Что проверяется:
// - локальные markdown-ссылки;
// - пути .agents/... в обратных кавычках;
// - обязательные файлы памяти;
// - поля и заголовок ADR, полнота INDEX.md;
// - статус действующих спек и их упоминание в specs/README.md;
// - ссылки на страницы библиотеки в library/README.md;
// - термины глоссария и согласованность с GLOSSARY.md.
//
// Шаблоны в auxiliary/templates не проверяются: их ссылки - примеры.
// Скилы, MCP и node_modules пропускаются.
const options = parseArgs(process.argv.slice(2));
const root = options.root;
const agents = path.join(root, ".agents");
const skipDirs = new Set(["skills", "mcp", "node_modules", "templates"]);
// bootstrap.md описывает будущий проект: часть путей появится только после старта.
const skipFiles = new Set(["bootstrap.md"]);
const problems = [];
const warnings = [];

// Разбор аргументов: корень проверки и машинный вывод.
function parseArgs(argv) {
  const parsed = { root: process.cwd(), json: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") {
      const value = argv[index + 1];
      if (!value) throw new Error("--root требует каталог.");
      parsed.root = path.resolve(value);
      index += 1;
    } else if (arg === "--json") {
      parsed.json = true;
    } else {
      throw new Error(`Неизвестный аргумент: ${arg}`);
    }
  }

  return parsed;
}

// Путь файла относительно корня проекта для сообщений.
function relative(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

// Текст без HTML-комментариев: примеры в шаблонах не считаются ссылками.
function withoutComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

// Сбор markdown-файлов .agents, кроме служебных каталогов.
function walk(dir, files) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      walk(full, files);
    } else if (entry.name.endsWith(".md") && !skipFiles.has(entry.name)) {
      files.push(full);
    }
  }
}

// Проверка одной локальной ссылки относительно файла.
function checkLink(file, target) {
  if (/^(https?:|mailto:|#)/.test(target)) return;
  if (target.includes("<") || target.includes("{") || target.includes("*")) return;
  const clean = decodeURIComponent(target.split("#")[0]);
  if (!clean) return;
  const resolved = path.resolve(path.dirname(file), clean);
  if (!existsSync(resolved)) problems.push(`${relative(file)}: ссылка на ${target}`);
}

// Проверка пути .agents/... в обратных кавычках.
// Каталоги mcp и skills необязательны: их может не быть в новом проекте.
function checkAgentsPath(file, raw) {
  if (!raw.startsWith(".agents/")) return;
  if (raw === ".agents/mcp/" || raw.startsWith(".agents/mcp/")) return;
  if (raw === ".agents/skills/" || raw.startsWith(".agents/skills/")) return;
  if (/[*<>{}]/.test(raw) || raw.includes(" ") || raw.includes("...")) return;
  const clean = raw.replace(/[),.;:]+$/, "");
  if (!existsSync(path.join(root, clean))) problems.push(`${relative(file)}: путь ${clean}`);
}

// Проверка ссылок и путей во всех собранных файлах.
function checkLinks(files) {
  for (const file of files) {
    const text = withoutComments(readFileSync(file, "utf8"));
    for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) checkLink(file, match[1]);
    for (const match of text.matchAll(/`([^`\n]+)`/g)) checkAgentsPath(file, match[1].trim());
  }
}

// Обязательный минимум памяти проекта.
function checkRequired() {
  const required = [
    ".agents/GLOSSARY.md",
    ".agents/glossary/README.md",
    ".agents/decisions/INDEX.md",
    ".agents/specs/README.md",
    ".agents/library/README.md",
    ".agents/auxiliary/README.md",
    ".agents/rules/global/memory.md",
    ".agents/rules/global/tasks.md",
    ".agents/rules/global/library.md",
    ".agents/rules/global/git.md",
    ".agents/rules/global/agents-guard.yml",
    ".agents/rules/project/quality.md",
    ".agents/rules/project/agents-guard.yml",
  ];
  for (const file of required) {
    if (!existsSync(path.join(root, file))) problems.push(`нет обязательного файла ${file}`);
  }
}

// Значение поля ADR по шаблону **Поле:** ...
function field(text, name) {
  const pattern = new RegExp(`\\*\\*${name}:\\*\\*\\s*([\\s\\S]*?)(?=\\n- \\*\\*|\\n\\n)`);
  return text.match(pattern)?.[1].replace(/\s+/g, " ").trim() ?? "";
}

// Поля ADR, форма заголовка, замены и полнота INDEX.md.
function checkDecisions() {
  const dir = path.join(agents, "decisions");
  if (!existsSync(dir)) return;
  const files = readdirSync(dir).filter((name) => /^\d{4}-.+\.md$/.test(name)).sort();
  const numbers = new Set(files.map((name) => name.slice(0, 4)));

  for (const name of files) {
    const text = readFileSync(path.join(dir, name), "utf8");
    for (const required of ["Статус", "Дата", "Область"]) {
      if (!field(text, required)) problems.push(`.agents/decisions/${name}: нет поля ${required}`);
    }
    if (!/^#\s+ADR\s+\d+:\s*\S/m.test(text)) {
      problems.push(`.agents/decisions/${name}: заголовок не по форме «# ADR NNNN: ...»`);
    }
    const status = field(text, "Статус");
    if (/^заменено/i.test(status)) {
      const replacement = status.match(/ADR\s+(\d{4})/)?.[1];
      if (!replacement) problems.push(`.agents/decisions/${name}: статус «заменено» без номера ADR`);
      else if (!numbers.has(replacement)) problems.push(`.agents/decisions/${name}: заменяющий ADR ${replacement} не найден`);
    }
  }

  const indexFile = path.join(dir, "INDEX.md");
  if (!existsSync(indexFile)) return;
  const index = withoutComments(readFileSync(indexFile, "utf8"));
  const links = new Set([...index.matchAll(/\]\((\d{4}-[^)]+\.md)\)/g)].map((match) => match[1]));
  for (const name of files) {
    if (!links.has(name)) problems.push(`.agents/decisions/INDEX.md: нет строки для ${name}`);
  }
  for (const name of links) {
    if (!files.includes(name)) problems.push(`.agents/decisions/INDEX.md: ссылка на несуществующий ${name}`);
  }
}

// Статус действующих спек.
function checkSpecs() {
  const dir = path.join(agents, "specs");
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir).filter((item) => item.endsWith(".md") && item !== "README.md")) {
    const text = readFileSync(path.join(dir, name), "utf8");
    if (!field(text, "Статус")) problems.push(`.agents/specs/${name}: нет поля Статус`);
  }
}

// Упоминание каждой спеки в specs/README.md.
function checkSpecsIndex() {
  const dir = path.join(agents, "specs");
  const readme = path.join(dir, "README.md");
  if (!existsSync(readme)) return;
  const text = withoutComments(readFileSync(readme, "utf8"));
  for (const name of readdirSync(dir).filter((item) => item.endsWith(".md") && item !== "README.md")) {
    if (!text.includes(name)) problems.push(`.agents/specs/README.md: нет упоминания ${name}`);
  }
}

// Ссылка на каждую страницу библиотеки из library/README.md.
function checkLibrary() {
  const dir = path.join(agents, "library");
  const readme = path.join(dir, "README.md");
  if (!existsSync(readme)) return;
  const text = withoutComments(readFileSync(readme, "utf8"));
  const pages = [];

  function walkLibrary(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walkLibrary(full);
      else if (entry.name.endsWith(".md") && entry.name !== "README.md") {
        pages.push(path.relative(dir, full).replaceAll("\\", "/"));
      }
    }
  }

  walkLibrary(dir);
  for (const page of pages) {
    if (!text.includes(`](${page})`)) problems.push(`.agents/library/README.md: нет ссылки на ${page}`);
  }
}

// Термины: один файл на термин, полнота GLOSSARY.md.
function checkGlossary() {
  const dir = path.join(agents, "glossary");
  if (!existsSync(dir)) return;
  const seen = new Map();
  const definitions = [];

  for (const name of readdirSync(dir).filter((item) => item.endsWith(".md") && item !== "README.md")) {
    const text = readFileSync(path.join(dir, name), "utf8");
    for (const match of text.matchAll(/^\*\*([^*\n]+)\*\*/gm)) {
      const term = match[1].trim();
      if (seen.has(term)) problems.push(`термин «${term}» повторяется: ${seen.get(term)} и ${name}`);
      seen.set(term, name);
      definitions.push({ term, file: name });
    }
  }

  const indexFile = path.join(agents, "GLOSSARY.md");
  if (!existsSync(indexFile)) return;
  const index = withoutComments(readFileSync(indexFile, "utf8"));
  const rows = new Map();
  for (const match of index.matchAll(/\|\s*\*\*([^*]+)\*\*\s*\|\s*\[[^\]]+\]\(([^)]+)\)\s*\|/g)) {
    rows.set(match[1].trim(), path.basename(match[2]));
  }

  for (const { term, file } of definitions) {
    if (!rows.has(term)) problems.push(`.agents/GLOSSARY.md: нет термина «${term}» из ${file}`);
    else if (rows.get(term) !== file) problems.push(`.agents/GLOSSARY.md: «${term}» ведёт в ${rows.get(term)}, а определён в ${file}`);
  }
  for (const term of rows.keys()) {
    if (!seen.has(term)) problems.push(`.agents/GLOSSARY.md: «${term}» не найден в glossary/`);
  }
}

// Корневые документы проверяются вместе с .agents.
const files = [];
if (existsSync(agents)) walk(agents, files);
for (const name of ["AGENTS.md", "README.md"]) {
  const file = path.join(root, name);
  if (existsSync(file)) files.push(file);
}

// Порядок проверок: обязательные файлы, ссылки, затем домены памяти.
checkRequired();
checkLinks(files);
checkDecisions();
checkSpecs();
checkSpecsIndex();
checkLibrary();
checkGlossary();

// Мягкие замечания: пока не используются, оставлены для расширения.
if (options.json) {
  console.log(JSON.stringify({ files: files.length, problems, warnings }, null, 2));
} else {
  if (warnings.length > 0) {
    console.log("Предупреждения:");
    for (const warning of warnings) console.log(`  ${warning}`);
  }

  if (problems.length > 0) {
    console.log("Проблемы:");
    for (const problem of problems) console.log(`  ${problem}`);
    console.log(`\nПроверка не пройдена: ${problems.length}.`);
  } else {
    console.log(`Проверка пройдена: ${files.length} файлов.`);
  }
}

process.exitCode = problems.length > 0 ? 1 : 0;

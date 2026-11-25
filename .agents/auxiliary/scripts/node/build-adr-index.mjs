import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// Сборка указателя ADR.
//
// Запуск из корня проекта:
//   node .agents/auxiliary/scripts/node/build-adr-index.mjs
//   node .agents/auxiliary/scripts/node/build-adr-index.mjs --root <каталог>
// Вход: .agents/decisions/NNNN-*.md.
// Выход: .agents/decisions/INDEX.md.
//
// INDEX.md - производный файл; источник истины - сами ADR.
// Скрипт читает шапку каждого ADR, делит решения на заменённые и действующие
// и собирает две таблицы. Ручные правки INDEX.md теряются при следующем запуске.
const root = parseRoot(process.argv.slice(2));
const decisions = path.join(root, ".agents/decisions");
const indexFile = path.join(decisions, "INDEX.md");

// Разбор аргументов: корень проекта.
function parseRoot(argv) {
  let value = process.cwd();

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--root") {
      const next = argv[index + 1];
      if (!next) throw new Error("--root требует каталог.");
      value = path.resolve(next);
      index += 1;
    } else {
      throw new Error(`Неизвестный аргумент: ${argv[index]}`);
    }
  }

  return value;
}

if (!existsSync(decisions)) {
  console.error("Нет каталога .agents/decisions.");
  process.exit(1);
}

const files = readdirSync(decisions)
  .filter((name) => /^\d{4}-.+\.md$/.test(name))
  .sort();

// Значение поля шапки ADR по шаблону **Поле:** ...
function field(text, name) {
  const pattern = new RegExp(`\\*\\*${name}:\\*\\*\\s*([\\s\\S]*?)(?=\\n- \\*\\*|\\n\\n)`);
  const match = text.match(pattern);
  return match ? match[1].replace(/\s+/g, " ").trim() : "";
}

// Замена длинных тире: указатель подчиняется правилу текстов.
function clean(value) {
  return value.replaceAll("\u2014", "-").replaceAll("\u2013", "-");
}

// Экранирование вертикальной черты в ячейке markdown-таблицы.
function escapeCell(value) {
  return clean(value).replaceAll("|", "\\|");
}

// Шапка каждого ADR: номер, файл, название, статус, область.
const rows = files.map((file) => {
  const text = readFileSync(path.join(decisions, file), "utf8");
  const number = file.slice(0, 4);
  const title = text.match(/^# ADR \d+:\s*(.+)$/m)?.[1]?.trim() ?? file;
  return {
    number,
    file,
    title: clean(title),
    status: field(text, "Статус") || "не указан",
    area: field(text, "Область"),
  };
});

// Деление решений: заменённые и действующие.
const numbers = new Set(rows.map((row) => row.number));
const superseded = rows.filter((row) => /^заменено/i.test(row.status));
const active = rows.filter((row) => !/^заменено/i.test(row.status));

// Ссылка на ADR в таблице.
function link(row) {
  return `[${row.number}](${row.file})`;
}

// Таблица заменённых: ссылка на заменяющее решение, если оно есть.
const supersededTable = superseded
  .map((row) => {
    const replacement = row.status.match(/ADR\s+(\d{4})/)?.[1];
    const target = replacement && numbers.has(replacement) ? rows.find((item) => item.number === replacement) : null;
    const replacementCell = target ? link(target) : clean(replacement ?? "");
    return `| ${link(row)} | ${escapeCell(row.title)} | ${replacementCell} |`;
  })
  .join("\n");

// Таблица действующих и уточнённых решений.
const activeTable = active
  .map((row) => `| ${link(row)} | ${escapeCell(row.title)} | ${escapeCell(row.status)} | ${escapeCell(row.area)} |`)
  .join("\n");

// Сборка markdown по разделам: заголовок, заменённые, действующие.
const sections = [
  "# Указатель решений",
  "",
  "Производный обзор ADR. Источник истины - сами ADR. Новый ADR добавляет строку",
  "сюда; старые строки не переписываются без причины.",
  "",
];

if (superseded.length > 0) {
  sections.push("## Заменённые", "", "| ADR | Решение | Заменено на |", "|---|---|---|", supersededTable, "");
}

sections.push("## Действующие и уточнённые", "", "| ADR | Решение | Статус | Область |", "|---|---|---|---|");

if (active.length > 0) {
  sections.push(activeTable);
} else {
  sections.push("| - | Пока нет решений | - | - |");
}

// Запись указателя и краткая сводка.
writeFileSync(indexFile, `${sections.join("\n")}\n`, "utf8");
console.log(`Действующих: ${active.length}, заменённых: ${superseded.length}, всего: ${rows.length}`);

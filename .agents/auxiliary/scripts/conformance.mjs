// Сверка реализаций проверок документации на разных языках.
//
// Универсальный набор лежит в auxiliary/scripts: каждая реализация - в своём
// подкаталоге и объявляет команды в manifest.json. Набор копируется целиком,
// поэтому реализации должны давать одинаковый результат на одном входе.
//
// Что сравнивается:
// - check-docs на действующем проекте;
// - check-docs на пустом корне, где не хватает обязательных файлов;
// - build-adr-index на копии каталога решений.
//
// Реализация, чей рантайм не установлен, пропускается: набор остаётся
// универсальным, а сверяются доступные языки.
//
// Запуск из корня проекта:
//   node .agents/auxiliary/scripts/conformance.mjs
// Код 1: реализации разошлись.

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const scripts = import.meta.dirname;
const project = path.resolve(scripts, "../../..");
const temp = mkdtempSync(path.join(os.tmpdir(), "toolbox-conformance-"));

// Намеренно сломанная документация: по одному нарушению каждого вида.
// Фикстура задана данными, а не файлами в репозитории, поэтому проверка
// документации не принимает её за настоящую память проекта.
const BROKEN = {
  "AGENTS.md": "# AGENTS\n\n[битая ссылка](missing.md)\n\nПуть `.agents/missing.md`.\n",
  ".agents/GLOSSARY.md":
    "# Глоссарий\n\n| Термин | Файл |\n|---|---|\n| **Альфа** | [alpha.md](glossary/alpha.md) |\n",
  ".agents/glossary/README.md": "# Глоссарий\n",
  ".agents/glossary/alpha.md": "**Альфа** - первый термин.\n\n**Бета** - второй термин.\n",
  ".agents/decisions/INDEX.md":
    "# Указатель решений\n\n| ADR | Решение |\n|---|---|\n| [0002](0002-other.md) | Другой |\n",
  ".agents/decisions/0001-broken.md":
    "# ADR 0001: Проверка\n\n- **Статус:** действует\n- **Область:** тест\n\n",
  ".agents/specs/README.md": "# Спеки\n",
  ".agents/specs/broken.md": "# Спека\n",
  ".agents/library/README.md": "# Библиотека\n",
  ".agents/library/page.md": "# Страница\n",
};

// Запись сломанной фикстуры во временный корень.
function writeBroken(root) {
  for (const [name, text] of Object.entries(BROKEN)) {
    const file = path.join(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text, "utf8");
  }
}

// Манифесты реализаций в подкаталогах auxiliary/scripts.
function loadImplementations() {
  const found = [];
  const languages = new Set();

  for (const entry of readdirSync(scripts, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(scripts, entry.name);
    const file = path.join(dir, "manifest.json");
    if (!existsSync(file)) throw new Error(`${dir}: нет manifest.json`);

    const manifest = JSON.parse(readFileSync(file, "utf8"));
    if (typeof manifest.language !== "string" || !/^[a-z0-9-]+$/i.test(manifest.language)) {
      throw new Error(`${file}: поле language должно быть простым именем из букв, цифр и дефиса`);
    }
    if (languages.has(manifest.language)) {
      throw new Error(`${file}: язык ${manifest.language} уже объявлен`);
    }
    languages.add(manifest.language);
    for (const field of ["checkDocs", "buildAdrIndex"]) {
      if (!Array.isArray(manifest[field]) || manifest[field].length === 0) {
        throw new Error(`${file}: поле ${field} должно быть непустым массивом`);
      }
    }
    found.push({ dir, ...manifest });
  }

  return found.sort((left, right) => left.language.localeCompare(right.language));
}

// Запуск команды реализации из её каталога.
function run(implementation, command, args) {
  const [binary, ...rest] = command;
  const result = spawnSync(binary, [...rest, ...args], {
    cwd: implementation.dir,
    encoding: "utf8",
  });

  if (result.error?.code === "ENOENT") return { skipped: true };
  if (result.error) throw result.error;
  return result;
}

// JSON проверки документации или ошибка с понятным источником.
function parseDocs(implementation, result) {
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`${implementation.language}: check-docs вернул не JSON.\n${result.stdout}${result.stderr}`);
  }
}

// Упорядоченный вид результата: порядок обхода не должен влиять на сверку.
function normalizeDocs(value) {
  return {
    files: value.files,
    problems: [...value.problems].sort(),
    warnings: [...value.warnings].sort(),
  };
}

// Проверка документации на заданном корне.
function checkDocs(implementation, root) {
  const result = run(implementation, implementation.checkDocs, ["--root", root, "--json"]);
  if (result.skipped) return result;
  return {
    language: implementation.language,
    status: result.status,
    parsed: normalizeDocs(parseDocs(implementation, result)),
  };
}

// Указатель ADR на отдельной копии решений.
function buildIndex(implementation) {
  const root = path.join(temp, implementation.language);
  const decisions = path.join(project, ".agents/decisions");
  if (!existsSync(decisions)) return null;

  mkdirSync(path.join(root, ".agents"), { recursive: true });
  cpSync(decisions, path.join(root, ".agents/decisions"), { recursive: true });

  const result = run(implementation, implementation.buildAdrIndex, ["--root", root]);
  if (result.skipped) return result;
  if (result.status !== 0) {
    throw new Error(
      `${implementation.language}: build-adr-index завершился с кодом ${result.status}.\n${result.stderr}`,
    );
  }

  return readFileSync(path.join(root, ".agents/decisions/INDEX.md"), "utf8");
}

// Разница списков проблем в двух результатах.
function differences(baseline, candidate) {
  const left = new Set(baseline.parsed.problems);
  const right = new Set(candidate.parsed.problems);
  return {
    onlyBaseline: [...left].filter((problem) => !right.has(problem)),
    onlyCandidate: [...right].filter((problem) => !left.has(problem)),
  };
}

// Первая различающаяся строка двух текстов.
function firstDifference(baseline, candidate) {
  const left = baseline.split("\n");
  const right = candidate.split("\n");

  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) {
      return `строка ${index + 1}: ${left[index] ?? "<нет строки>"} != ${right[index] ?? "<нет строки>"}`;
    }
  }

  return "различие не по строкам";
}

// Сверка одной проверки: печать расхождения и общий итог.
function compareDocs(label, baseline, candidate) {
  const diff = differences(baseline, candidate);
  const sameStatus = baseline.status === candidate.status;
  const sameFiles = baseline.parsed.files === candidate.parsed.files;
  const sameWarnings = JSON.stringify(baseline.parsed.warnings) === JSON.stringify(candidate.parsed.warnings);

  if (sameStatus && sameFiles && sameWarnings && diff.onlyBaseline.length === 0 && diff.onlyCandidate.length === 0) {
    console.log(`  ${label}: совпадает`);
    return true;
  }

  console.error(`  ${label}: расхождение`);
  if (!sameStatus) console.error(`    код выхода: ${baseline.status} != ${candidate.status}`);
  if (!sameFiles) console.error(`    файлов: ${baseline.parsed.files} != ${candidate.parsed.files}`);
  for (const problem of diff.onlyBaseline) console.error(`    только у ${baseline.language}: ${problem}`);
  for (const problem of diff.onlyCandidate) console.error(`    только у ${candidate.language}: ${problem}`);
  if (!sameWarnings) console.error("    предупреждения различаются");
  return false;
}

// Сверка указателя ADR.
function compareIndex(baseline, candidate) {
  if (baseline === candidate) {
    console.log("  build-adr-index: совпадает");
    return true;
  }

  console.error("  build-adr-index: расхождение");
  console.error(`    ${firstDifference(baseline, candidate)}`);
  return false;
}

// Поиск доступных реализаций и последовательная сверка.
function main() {
  const implementations = loadImplementations();
  if (implementations.length < 2) {
    console.log(`Реализаций: ${implementations.length}. Сверять нечего.`);
    return;
  }

  const available = [];
  for (const implementation of implementations) {
    const result = checkDocs(implementation, project);
    if (result.skipped) {
      console.log(`${implementation.language}: рантайм недоступен, пропуск.`);
      continue;
    }
    available.push({ implementation, project: result });
  }

  if (available.length < 2) {
    console.log("Доступна одна реализация. Сверять нечего.");
    return;
  }

  const baseline = available[0];
  const others = available.slice(1);
  const emptyRoot = path.join(temp, "empty");
  const brokenRoot = path.join(temp, "broken");
  mkdirSync(emptyRoot, { recursive: true });
  writeBroken(brokenRoot);

  console.log(`Эталон: ${baseline.implementation.language}.`);
  let failed = false;

  for (const candidate of others) {
    console.log(`${candidate.implementation.language}:`);
    failed = !compareDocs("действующий проект", baseline.project, candidate.project) || failed;

    const baselineEmpty = checkDocs(baseline.implementation, emptyRoot);
    const candidateEmpty = checkDocs(candidate.implementation, emptyRoot);
    failed = !compareDocs("пустой корень", baselineEmpty, candidateEmpty) || failed;

    const baselineBroken = checkDocs(baseline.implementation, brokenRoot);
    const candidateBroken = checkDocs(candidate.implementation, brokenRoot);
    failed = !compareDocs("нарушения в документации", baselineBroken, candidateBroken) || failed;

    const baselineIndex = buildIndex(baseline.implementation);
    const candidateIndex = buildIndex(candidate.implementation);
    if (baselineIndex !== null && candidateIndex !== null && !baselineIndex.skipped && !candidateIndex.skipped) {
      failed = !compareIndex(baselineIndex, candidateIndex) || failed;
    }
  }

  if (failed) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  rmSync(temp, { recursive: true, force: true });
}

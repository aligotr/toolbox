import { access, mkdtemp, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import sharp from "sharp";

type ImageFormat = "png" | "webp" | "avif";

type Options = {
  inputPath: string;
  formats: ImageFormat[];
  quality: number;
  overwrite: boolean;
};

const projectRoot = process.cwd();
const supportedInputExtensions = new Set([".jpg", ".jpeg", ".png"]);
const supportedOptions = new Set(["formats", "quality", "overwrite"]);

try {
  const options = parseArguments(process.argv.slice(2));
  await optimizeImages(options);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Ошибка: ${message}`);
  process.exitCode = 1;
}

function parseArguments(argumentsList: string[]): Options {
  const positionalArguments: string[] = [];
  const values = new Map<string, string>();

  for (const argument of argumentsList) {
    if (!argument.startsWith("--")) {
      positionalArguments.push(argument);
      continue;
    }

    const separatorIndex = argument.indexOf("=");

    if (separatorIndex === -1) {
      throw new Error(`Неизвестный аргумент: ${argument}. Используйте формат --name=value`);
    }

    const optionName = argument.slice(2, separatorIndex);

    if (!supportedOptions.has(optionName)) {
      throw new Error(`Неизвестный параметр: --${optionName}`);
    }

    values.set(optionName, argument.slice(separatorIndex + 1));
  }

  const inputArgument = positionalArguments[0];

  if (!inputArgument || positionalArguments.length > 1) {
    throw new Error("Укажите один путь к файлу или папке: npm run images:optimize -- <path>");
  }

  const quality = Number(values.get("quality") ?? 85);

  if (!Number.isInteger(quality) || quality < 1 || quality > 100) {
    throw new Error("Параметр --quality должен быть целым числом от 1 до 100");
  }

  const formats = parseFormats(values.get("formats") ?? "webp");

  return {
    inputPath: path.resolve(projectRoot, inputArgument),
    formats,
    quality,
    overwrite: values.get("overwrite") === "true",
  };
}

function parseFormats(value: string): ImageFormat[] {
  const formats = value
    .split(",")
    .map((format) => format.trim().toLowerCase())
    .filter(
      (format): format is ImageFormat => format === "png" || format === "webp" || format === "avif",
    );

  if (formats.length === 0 || new Set(formats).size !== value.split(",").filter(Boolean).length) {
    throw new Error("Параметр --formats поддерживает только png, webp и avif");
  }

  return [...new Set(formats)];
}

async function optimizeImages({ inputPath, formats, quality, overwrite }: Options): Promise<void> {
  const inputFiles = await resolveInputFiles(inputPath);

  if (inputFiles.length === 0) {
    console.log(`Поддерживаемые изображения не найдены: ${path.relative(projectRoot, inputPath)}`);
    return;
  }

  let processedFiles = 0;
  let skippedFiles = 0;
  const conflictingInputs = findConflictingInputs(inputFiles, formats);
  const reportedConflicts = new Set<string>();

  for (const inputFile of inputFiles) {
    const result = await optimizeInputFile({
      inputFile,
      inputFiles,
      formats,
      quality,
      overwrite,
      conflictingInputs,
      reportedConflicts,
    });

    processedFiles += result.processedFiles;
    skippedFiles += result.skippedFiles;
  }

  console.log(`Обработано: ${processedFiles}; пропущено: ${skippedFiles}`);
}

type InputFileOptions = Options & {
  inputFile: string;
  inputFiles: string[];
  conflictingInputs: Set<string>;
  reportedConflicts: Set<string>;
};

type OptimizationResult = {
  processedFiles: number;
  skippedFiles: number;
};

async function optimizeInputFile({
  inputFile,
  inputFiles,
  formats,
  quality,
  overwrite,
  conflictingInputs,
  reportedConflicts,
}: InputFileOptions): Promise<OptimizationResult> {
  let sourceFile = inputFile;
  let processedFiles = 0;
  let skippedFiles = 0;

  for (const format of formats) {
    const result = await optimizeInputFormat({
      inputFile,
      inputFiles,
      sourceFile,
      format,
      quality,
      overwrite,
      conflictingInputs,
      reportedConflicts,
    });

    sourceFile = result.sourceFile;
    processedFiles += result.processedFiles;
    skippedFiles += result.skippedFiles;
  }

  return { processedFiles, skippedFiles };
}

type InputFormatOptions = Omit<InputFileOptions, "formats"> & {
  format: ImageFormat;
  sourceFile: string;
};

type InputFormatResult = OptimizationResult & {
  sourceFile: string;
};

async function optimizeInputFormat({
  inputFile,
  inputFiles,
  sourceFile,
  format,
  quality,
  overwrite,
  conflictingInputs,
  reportedConflicts,
}: InputFormatOptions): Promise<InputFormatResult> {
  const outputFile = getOutputFile(inputFile, format);

  if (conflictingInputs.has(`${inputFile}:${format}`)) {
    reportConflict(outputFile, inputFiles, reportedConflicts);
    return { sourceFile, processedFiles: 0, skippedFiles: 1 };
  }

  if (isSameFormatAsInput(inputFile, format)) {
    const preparedSourceFile = await prepareSameFormatOutput(sourceFile, outputFile, quality);

    if (!preparedSourceFile) {
      return { sourceFile, processedFiles: 0, skippedFiles: 1 };
    }

    console.log(`Готово: ${getDisplayPath(outputFile)}`);
    return { sourceFile: preparedSourceFile, processedFiles: 1, skippedFiles: 0 };
  } else if (!overwrite && (await fileExists(outputFile))) {
    console.log(`Пропуск: ${getDisplayPath(outputFile)}`);
    return { sourceFile, processedFiles: 0, skippedFiles: 1 };
  }

  const written = await writeOptimizedImage(sourceFile, outputFile, format, quality, overwrite);

  if (!written) {
    return { sourceFile, processedFiles: 0, skippedFiles: 1 };
  }

  console.log(`Готово: ${getDisplayPath(outputFile)}`);

  return { sourceFile, processedFiles: 1, skippedFiles: 0 };
}

function isSameFormatAsInput(inputFile: string, format: ImageFormat): boolean {
  return path.extname(inputFile).toLowerCase() === `.${format}`;
}

function reportConflict(
  outputFile: string,
  inputFiles: string[],
  reportedConflicts: Set<string>,
): void {
  if (reportedConflicts.has(outputFile)) {
    return;
  }

  const conflictSources = getConflictSources(outputFile, inputFiles);
  console.log(
    `Пропуск: конфликт конечного имени\n` +
      `  Исходники: ${conflictSources.map(getDisplayPath).join(", ")}\n` +
      `  Результат: ${getDisplayPath(outputFile)}`,
  );
  reportedConflicts.add(outputFile);
}

function getOutputFile(inputFile: string, format: ImageFormat): string {
  return path.join(
    path.dirname(inputFile),
    `${path.basename(inputFile, path.extname(inputFile))}.${format}`,
  );
}

function findConflictingInputs(inputFiles: string[], formats: ImageFormat[]): Set<string> {
  const outputOwners = new Map<string, string[]>();

  for (const inputFile of inputFiles) {
    for (const format of formats) {
      const outputFile = getOutputFile(inputFile, format);
      const owners = outputOwners.get(outputFile) ?? [];
      owners.push(inputFile);
      outputOwners.set(outputFile, owners);
    }
  }

  const conflicts = new Set<string>();

  for (const [outputFile, owners] of outputOwners) {
    if (owners.length < 2) {
      continue;
    }

    for (const owner of owners) {
      const format = path.extname(outputFile).slice(1) as ImageFormat;
      conflicts.add(`${owner}:${format}`);
    }
  }

  return conflicts;
}

function getConflictSources(outputFile: string, inputFiles: string[]): string[] {
  const format = path.extname(outputFile).slice(1) as ImageFormat;
  return inputFiles.filter((candidate) => getOutputFile(candidate, format) === outputFile);
}

async function prepareSameFormatOutput(
  inputFile: string,
  outputFile: string,
  quality: number,
): Promise<string | null> {
  const sourceFile = path.join(path.dirname(inputFile), `src_${path.basename(inputFile)}`);

  if (await fileExists(sourceFile)) {
    console.log(`Пропуск: резервный файл уже существует: ${getDisplayPath(sourceFile)}`);
    return null;
  }

  const temporaryOutput = await writeTemporaryOptimizedImage(inputFile, outputFile, "png", quality);
  let inputWasRenamed = false;

  try {
    await rename(inputFile, sourceFile);
    inputWasRenamed = true;
    await rename(temporaryOutput, outputFile);
    await removeTemporaryDirectory(temporaryOutput);
  } catch (error) {
    await rm(temporaryOutput, { force: true });
    await removeTemporaryDirectory(temporaryOutput);

    if (inputWasRenamed && !(await fileExists(inputFile))) {
      await rename(sourceFile, inputFile);
    }

    throw error;
  }

  return sourceFile;
}

async function writeOptimizedImage(
  inputFile: string,
  outputFile: string,
  format: ImageFormat,
  quality: number,
  overwrite: boolean,
): Promise<boolean> {
  if (!overwrite && (await fileExists(outputFile))) {
    console.log(`Пропуск: конечный файл уже существует: ${getDisplayPath(outputFile)}`);
    return false;
  }

  const temporaryOutput = await writeTemporaryOptimizedImage(
    inputFile,
    outputFile,
    format,
    quality,
  );
  const backupOutput = `${temporaryOutput}.backup`;
  let outputWasBackedUp = false;

  try {
    if (await fileExists(outputFile)) {
      if (!overwrite) {
        await removeTemporaryDirectory(temporaryOutput);
        console.log(`Пропуск: конечный файл уже существует: ${getDisplayPath(outputFile)}`);
        return false;
      }

      await rename(outputFile, backupOutput);
      outputWasBackedUp = true;
    }

    await rename(temporaryOutput, outputFile);
    await rm(backupOutput, { force: true });
    await removeTemporaryDirectory(temporaryOutput);
  } catch (error) {
    await rm(temporaryOutput, { force: true });

    if (outputWasBackedUp && !(await fileExists(outputFile))) {
      await rename(backupOutput, outputFile);
    }

    await removeTemporaryDirectory(temporaryOutput);

    throw error;
  }

  return true;
}

async function removeTemporaryDirectory(temporaryOutput: string): Promise<void> {
  await rm(path.dirname(temporaryOutput), { recursive: true, force: true });
}

async function writeTemporaryOptimizedImage(
  inputFile: string,
  outputFile: string,
  format: ImageFormat,
  quality: number,
): Promise<string> {
  const temporaryDirectory = await mkdtemp(
    path.join(path.dirname(outputFile), ".image-optimizer-"),
  );
  const temporaryOutput = path.join(temporaryDirectory, path.basename(outputFile));
  const image = sharp(inputFile);

  try {
    if (format === "png") {
      await image.png({ compressionLevel: 9, effort: 10 }).toFile(temporaryOutput);
    } else if (format === "webp") {
      await image.webp({ quality, effort: 6 }).toFile(temporaryOutput);
    } else {
      await image.avif({ quality, effort: 6 }).toFile(temporaryOutput);
    }

    return temporaryOutput;
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

async function resolveInputFiles(inputPath: string): Promise<string[]> {
  let inputStatistics: Awaited<ReturnType<typeof stat>>;

  try {
    inputStatistics = await stat(inputPath);
  } catch {
    throw new Error(`Путь не найден или недоступен: ${getDisplayPath(inputPath)}`);
  }

  if (inputStatistics.isFile()) {
    return isSupportedInputFile(inputPath) ? [inputPath] : [];
  }

  if (inputStatistics.isDirectory()) {
    return collectImageFiles(inputPath);
  }

  return [];
}

async function collectImageFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectImageFiles(entryPath)));
      continue;
    }

    if (isSupportedInputFile(entryPath)) {
      files.push(entryPath);
    }
  }

  return files;
}

function isSupportedInputFile(filePath: string): boolean {
  return (
    !path.basename(filePath).startsWith("src_") &&
    supportedInputExtensions.has(path.extname(filePath).toLowerCase())
  );
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function getDisplayPath(filePath: string): string {
  return path.relative(projectRoot, filePath) || filePath;
}

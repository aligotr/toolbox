// Точка сборки мультиязычности (ADR 0039).
//
// Здесь встроенный русский становится эталоном, а язык выбирается до первого
// кадра: блокирующий экран обязан быть переведён, хотя настройки интерфейс
// ещё не читал. Вне Tauri язык остаётся русским, ошибок нет.

import { installBuiltin } from "@/core/infra/i18n";
import { ruMessages } from "@/core/infra/i18n/messages";
import {
  activateLanguage,
  BUILTIN_LANGUAGE,
  languages,
  loadLanguages,
} from "@/core/services/languages";
import {
  loadSettings,
  setLanguage,
  settings,
} from "@/core/services/settings/index";
import { loadStartupStatus } from "@/core/services/startup";

/**
 * Готовит словарь до монтирования приложения.
 *
 * Порядок: встроенный русский → сохранённый выбор → системный язык при первом
 * запуске. Вне Tauri и при блокировке запуска чтение настроек пропускается.
 */
export async function setupLocale(): Promise<void> {
  installBuiltin(ruMessages);
  await activateLanguage(await chooseLanguage());
}

/** Выбирает язык: сохранённый, определённый при первом запуске или русский. */
async function chooseLanguage(): Promise<string> {
  const startup = await loadStartupStatus();
  if (startup === null) return BUILTIN_LANGUAGE;
  if (startup.blocked) return startup.language;

  await loadSettings();
  if (!settings.loaded) return BUILTIN_LANGUAGE;

  const stored = settings.current?.ui.language ?? null;
  if (stored !== null) return stored;

  // Первый запуск: выбор фиксируется, чтобы система не меняла язык позже.
  const detected = await detectLanguage();
  await setLanguage(detected);
  return detected;
}

/** Системный язык, если для него есть словарь; иначе русский. */
async function detectLanguage(): Promise<string> {
  await loadLanguages();

  const preferred = navigator.language.toLowerCase();
  const base = preferred.split("-")[0];
  const available = languages.items.filter((item) => item.problem === null);

  const exact = available.find((item) => item.code.toLowerCase() === preferred);
  if (exact) return exact.code;

  const byBase = available.find((item) => item.code.toLowerCase() === base);
  if (byBase) return byBase.code;

  return BUILTIN_LANGUAGE;
}

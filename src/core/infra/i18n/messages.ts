// Русские сообщения интерфейса — встроенный словарь и эталон ключей (ADR 0039).
//
// Сейчас это один файл; по мере перевода фрагменты уходят к владельцам кода,
// а `app/locales.ts` собирает из них каталог. Внешний словарь накладывается
// сверху: непереведённый ключ берётся отсюда.
//
// Ключ — контракт `область.сущность.поле`: формулировку менять можно,
// ключ — нет.

import type { Messages } from "./types.ts";

/** Русский встроенный словарь. */
export const ruMessages: Messages = {
  // ── Центр управления ────────────────────────────────────────────────────
  "settings.view.title": "Настройки",
  "settings.view.lead":
    "Журнал, окно, профили, шаблоны, данные и сведения о программе.",
  "settings.view.nav": "Разделы настроек",

  "settings.section.log": "Журнал",
  "settings.section.window": "Окно",
  "settings.section.profiles": "Профили",
  "settings.section.templates": "Шаблоны",
  "settings.section.data": "Данные",
  "settings.section.language": "Язык",
  "settings.section.app": "Программа",

  // ── Раздел «Язык» ───────────────────────────────────────────────────────
  "settings.language.title": "Язык",
  "settings.language.lead":
    "Русский встроен в программу и всегда доступен. Другие языки — файлы в local/languages/: их можно править и дополнять, не собирая программу.",
  "settings.language.current": "Язык интерфейса",
  "settings.language.russian": "Русский",
  "settings.language.builtin": "встроенный",
  "settings.language.broken": "не прочитан",
  "settings.language.complete": "переведён полностью",
  "settings.language.missing": {
    one: "не переведён {count} ключ",
    few: "не переведено {count} ключа",
    many: "не переведено {count} ключей",
    other: "не переведено {count} ключа",
  },
  "settings.language.lost":
    "Выбранный словарь не найден или не прочитан: интерфейс показывает русский. Выбор сохранён.",
  "settings.language.partial": {
    one: "Один ключ не переведён — он показывается по-русски.",
    few: "{count} ключа не переведены — они показываются по-русски.",
    many: "{count} ключей не переведены — они показываются по-русски.",
    other: "{count} ключа не переведены — они показываются по-русски.",
  },
  "settings.language.extra": {
    one: "В словаре {count} лишний ключ — такого ключа нет в русском.",
    few: "В словаре {count} лишних ключа — таких ключей нет в русском.",
    many: "В словаре {count} лишних ключей — таких ключей нет в русском.",
    other: "В словаре {count} лишних ключа — таких ключей нет в русском.",
  },
  "settings.language.empty":
    "В папке словарей пока нет файлов: доступен только встроенный русский.",
  "settings.language.problem": "Файл {code} не прочитан: {reason}",
  "settings.language.refresh": "Обновить",
  "settings.language.open_folder": "Открыть папку словарей",
  "settings.language.export": "Выгрузить образец",
  "settings.language.exported": "Образец записан: {path}",
  "settings.language.note":
    "Файл словаря приложение не перезаписывает: правки и комментарии сохраняются. Ключи переименовывать нельзя — это контракт.",
};

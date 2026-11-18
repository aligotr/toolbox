// Реестр разделов центра управления.
//
// Список - данные, а не поведение: экран рисует по нему вертикальную
// навигацию. Выбранный раздел живёт отдельно (`navigation.ts`), потому что
// его меняет ещё и сайдбар. Порядок: профили и язык - настройка, окно
// и журнал - обслуживание, сведения о сборке - последними.

/** Идентификаторы разделов: они же ключи списка. */
export type SettingsSection = "log" | "window" | "profiles" | "language" | "app";

/** Пункт вертикального списка разделов. */
export interface SettingsSectionMeta {
  id: SettingsSection;
  /** Ключ словаря: подпись переводится при показе (ADR 0039). */
  titleKey: string;
  icon: string;
}

/** Порядок разделов: настройка, обслуживание, сведения. */
export const SETTINGS_SECTIONS: SettingsSectionMeta[] = [
  { id: "profiles", titleKey: "settings.section.profiles", icon: "pi pi-users" },
  { id: "language", titleKey: "settings.section.language", icon: "pi pi-globe" },
  { id: "window", titleKey: "settings.section.window", icon: "pi pi-window-maximize" },
  { id: "log", titleKey: "settings.section.log", icon: "pi pi-file" },
  { id: "app", titleKey: "settings.section.app", icon: "pi pi-info-circle" },
];

// Реестр разделов центра управления.
//
// Список — данные, а не поведение: экран рисует по нему вертикальную
// навигацию. Выбранный раздел живёт отдельно (`navigation.ts`), потому что
// его меняет ещё и сайдбар. Порядок — от ежедневного к редкому.

/** Идентификаторы разделов: они же ключи списка. */
export type SettingsSection = "log" | "window" | "profiles" | "language" | "app";

/** Пункт вертикального списка разделов. */
export interface SettingsSectionMeta {
  id: SettingsSection;
  /** Ключ словаря: подпись переводится при показе (ADR 0039). */
  titleKey: string;
  icon: string;
}

/** Порядок разделов: от ежедневного к редкому. */
export const SETTINGS_SECTIONS: SettingsSectionMeta[] = [
  { id: "log", titleKey: "settings.section.log", icon: "pi pi-file" },
  { id: "window", titleKey: "settings.section.window", icon: "pi pi-window-maximize" },
  { id: "profiles", titleKey: "settings.section.profiles", icon: "pi pi-users" },
  { id: "language", titleKey: "settings.section.language", icon: "pi pi-globe" },
  { id: "app", titleKey: "settings.section.app", icon: "pi pi-info-circle" },
];

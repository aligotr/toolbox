// Реестр разделов центра управления.
//
// Список — данные, а не поведение: экран рисует по нему вертикальную
// навигацию. Выбранный раздел живёт отдельно (`navigation.ts`), потому что
// его меняет ещё и сайдбар. Порядок — от ежедневного к редкому.

/** Идентификаторы разделов: они же ключи списка. */
export type SettingsSection =
  | "log"
  | "window"
  | "profiles"
  | "templates"
  | "data"
  | "app";

/** Пункт вертикального списка разделов. */
export interface SettingsSectionMeta {
  id: SettingsSection;
  title: string;
  icon: string;
}

/** Порядок разделов: от ежедневного к редкому. */
export const SETTINGS_SECTIONS: SettingsSectionMeta[] = [
  { id: "log", title: "Журнал", icon: "pi pi-file" },
  { id: "window", title: "Окно", icon: "pi pi-window-maximize" },
  { id: "profiles", title: "Профили", icon: "pi pi-users" },
  { id: "templates", title: "Шаблоны", icon: "pi pi-th-large" },
  { id: "data", title: "Данные", icon: "pi pi-database" },
  { id: "app", title: "Программа", icon: "pi pi-info-circle" },
];

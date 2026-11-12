// Разделы центра управления и выбранный раздел.
//
// Выбор живёт вне компонентов: пункт «Управление профилями» в меню сайдбара
// открывает ту же вкладку настроек, что и иконка, но сразу на нужном разделе.
// Если бы выбор принадлежал `SettingsView`, сайдбару пришлось бы ждать
// монтирования компонента и передавать ему команду через события.

import { ref } from "vue";

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

/** Выбранный раздел; по умолчанию — журнал. */
export const activeSection = ref<SettingsSection>("log");

/** Открывает раздел настроек. */
export function openSettingsSection(section: SettingsSection): void {
  activeSection.value = section;
}

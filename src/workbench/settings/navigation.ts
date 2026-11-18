// Выбранный раздел настроек.
//
// Выбор живёт вне компонентов: пункт «Управление профилями» в меню сайдбара
// открывает ту же вкладку настроек, что и иконка, но сразу на нужном разделе.
// Если бы выбор принадлежал `SettingsView`, сайдбару пришлось бы ждать
// монтирования компонента и передавать ему команду через события.

import { ref } from "vue";
import { SETTINGS_SECTIONS, type SettingsSection } from "./sections";

/** Выбранный раздел; по умолчанию - первый в списке, то есть верхний. */
export const activeSection = ref<SettingsSection>(SETTINGS_SECTIONS[0].id);

/** Открывает раздел настроек. */
export function openSettingsSection(section: SettingsSection): void {
  activeSection.value = section;
}

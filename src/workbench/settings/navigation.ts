// Выбранный раздел настроек.
//
// Выбор живёт вне компонентов: пункт «Управление профилями» в меню сайдбара
// открывает ту же вкладку настроек, что и иконка, но сразу на нужном разделе.
// Если бы выбор принадлежал `SettingsView`, сайдбару пришлось бы ждать
// монтирования компонента и передавать ему команду через события.

import { ref } from "vue";
import type { SettingsSection } from "./sections";

/** Выбранный раздел; по умолчанию — журнал. */
export const activeSection = ref<SettingsSection>("log");

/** Открывает раздел настроек. */
export function openSettingsSection(section: SettingsSection): void {
  activeSection.value = section;
}

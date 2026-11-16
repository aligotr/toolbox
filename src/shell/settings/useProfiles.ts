// Сценарии профилей для оболочки: подтверждение и вызов ядра.
//
// Переключение закрывает приложение, удаление уносит папку с данными.
// Спрашивать об этом по-разному в меню сайдбара и в настройках — значит
// однажды забыть подтверждение в одном из мест, поэтому текст живёт здесь.

import { useConfirm } from "primevue/useconfirm";
import type { Profile } from "../../contracts/profiles";
import { CONFIRM_CALM_REJECT, CONFIRM_DANGER_ACCEPT } from "../../core/constants";
import { deleteProfile, switchProfile } from "../../core/services/profiles";

export function useProfiles() {
  const confirm = useConfirm();

  /** Переключение с предупреждением о перезапуске. */
  function requestSwitch(profile: Profile): void {
    confirm.require({
      header: "Переключение профиля",
      message: `Открыть профиль «${profile.title}»? Приложение перезапустится.`,
      acceptLabel: "Переключить",
      rejectLabel: "Отмена",
      rejectProps: CONFIRM_CALM_REJECT,
      accept: () => void switchProfile(profile.id),
    });
  }

  /** Удаление в корзину: данные возвращаемы, пока корзину не почистили. */
  function requestDelete(profile: Profile): void {
    confirm.require({
      header: "Удаление профиля",
      message:
        `Профиль «${profile.title}» будет перемещён в local/trash. ` +
        "Данные можно вернуть, пока корзину не почистили.",
      acceptLabel: "Удалить",
      rejectLabel: "Отмена",
      acceptProps: CONFIRM_DANGER_ACCEPT,
      rejectProps: CONFIRM_CALM_REJECT,
      accept: () => void deleteProfile(profile),
    });
  }

  return { requestSwitch, requestDelete };
}

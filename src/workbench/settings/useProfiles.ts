// Сценарии профилей для оболочки: подтверждение и вызов ядра.
//
// Переключение закрывает приложение, удаление уносит папку с данными.
// Спрашивать об этом по-разному в меню сайдбара и в настройках — значит
// однажды забыть подтверждение в одном из мест, поэтому текст живёт здесь.

import { useConfirm } from "primevue/useconfirm";
import type { Profile } from "@/contracts/profiles";
import { CONFIRM_CALM_REJECT } from "@/core/constants";
import { t } from "@/core/infra/i18n";
import { deleteProfile, switchProfile } from "@/core/services/profiles";
import { requireConfirm } from "@/ui/confirmPopup";

export function useProfiles() {
  const confirm = useConfirm();

  /** Переключение с предупреждением о перезапуске. */
  function requestSwitch(profile: Profile, onCancel?: () => void): void {
    confirm.require({
      header: t("settings.profiles.switchHeader"),
      message: t("settings.profiles.switchMessage", { title: profile.title }),
      acceptLabel: t("settings.profiles.switchAccept"),
      rejectLabel: t("settings.profiles.switchReject"),
      rejectProps: CONFIRM_CALM_REJECT,
      reject: onCancel,
      accept: () => void switchProfile(profile.id),
    });
  }

  /**
   * Удаление в корзину: спрашиваем у самой кнопки, как у очистки записей.
   *
   * Данные возвращаемы, пока корзину не почистили, поэтому вопрос короткий:
   * называет профиль и не пугает подробностями, которые и так видны в списке.
   */
  function requestDelete(profile: Profile, event: MouseEvent): void {
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) return;

    requireConfirm(confirm, {
      target,
      message: t("settings.profiles.deleteMessage", { title: profile.title }),
      acceptLabel: t("settings.profiles.deleteAccept"),
      rejectLabel: t("settings.profiles.deleteReject"),
      accept: () => void deleteProfile(profile),
    });
  }

  return { requestSwitch, requestDelete };
}

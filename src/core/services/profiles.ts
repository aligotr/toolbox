// Профили: список, создание, переименование, удаление и переключение.
//
// Профиль — папка `profiles/<id>/` (ADR 0010). Список всегда читается
// из папки, отдельного реестра нет, поэтому единственный источник правды —
// ядро. Здесь живёт состояние для интерфейса и сценарии, а не разметка:
// меню сайдбара и раздел настроек показывают одно и то же.
//
// Переключение применяется перезапуском: сервисы читают папку профиля один
// раз при старте. Рабочее пространство у каждого профиля своё
// (`local/workspaces/<id>.json`), но машинное; перед перезапуском оно
// сохраняется, иначе последняя правка терялась бы.

import { invoke } from "@tauri-apps/api/core";
import { computed, reactive } from "vue";
import type { Profile, ProfileList, ProfileUsage } from "@/contracts/profiles";
import { t } from "@/core/infra/i18n";
import { JOURNAL_CORE_SOURCE } from "../infra/constants";
import { appErrorOf, describeError } from "../infra/errors";
import { write } from "../infra/journal";
import { notify } from "../infra/notifications";
import { idle, type OperationStatus } from "../infra/status";
import { flushWorkspace } from "./workspace/index";

/** Операции, у каждой своё состояние: отказ создания не блокирует список. */
export type ProfileOperation = "list" | "usage" | "create" | "rename" | "delete" | "switch";

/** Состояние списка профилей. */
export interface ProfilesState {
  /** Идентификатор активного профиля; пусто, пока список не прочитан. */
  active: string;
  /** Идентификатор профиля по умолчанию; приходит из ядра. */
  defaultId: string;
  items: Profile[];
  /** Прочитан ли список хотя бы раз. */
  loaded: boolean;
}

/** Общее состояние профилей. */
export const profiles = reactive<ProfilesState>({
  active: "",
  defaultId: "",
  items: [],
  loaded: false,
});

/** Счётчики профилей: нужны только разделу «Профили». */
export interface ProfileUsageState {
  items: Record<string, ProfileUsage>;
  loaded: boolean;
}

/** Счётчики по идентификатору профиля. */
export const profileUsage = reactive<ProfileUsageState>({ items: {}, loaded: false });

/** Счётчики профиля или `undefined`, пока они не прочитаны. */
export function profileUsageOf(id: string): ProfileUsage | undefined {
  return profileUsage.items[id];
}

/** Состояния операций: `status.create.loading`, `status.delete.error` и т. д. */
export const status = reactive<Record<ProfileOperation, OperationStatus>>({
  list: idle(),
  usage: idle(),
  create: idle(),
  rename: idle(),
  delete: idle(),
  switch: idle(),
});

/** Показывает отказ операции уведомлением: код переводит словарь. */
function notifyError(error: unknown, group: string): void {
  const coded = appErrorOf(error);
  notify({
    kind: "error",
    code: coded.code,
    params: coded.params,
    fallback: coded.fallback,
    group,
  });
}

/** Активный профиль или `null`, пока список не прочитан. */
export const activeProfile = computed<Profile | null>(
  () => profiles.items.find((profile) => profile.id === profiles.active) ?? null,
);

/** Перечитывает список профилей. */
async function reload(): Promise<void> {
  const list = await invoke<ProfileList>("profiles_list");
  profiles.active = list.active;
  profiles.defaultId = list.default_id;
  profiles.items = list.items;
  profiles.loaded = true;
}

/** Перечитывает счётчики профилей. */
async function reloadUsage(): Promise<void> {
  const items = await invoke<ProfileUsage[]>("profiles_usage");
  profileUsage.items = Object.fromEntries(items.map((item) => [item.id, item]));
  profileUsage.loaded = true;
}

/**
 * Обновляет счётчики, не превращая их отказ в отказ операции.
 *
 * Нужен после создания и удаления: профиль уже изменён, и ошибка счётчиков
 * не должна выглядеть как неудавшееся создание.
 */
async function refreshUsage(): Promise<void> {
  try {
    await reloadUsage();
  } catch (error) {
    status.usage.error = describeError(error);
    notifyError(error, "profile-usage");
    write(JOURNAL_CORE_SOURCE, "error", "journal.profiles.usageError", {
      reason: error,
    });
  }
}

/** Название профиля по умолчанию даётся один раз за сеанс. */
let defaultNamed = false;

/**
 * Даёт профилю по умолчанию название на языке интерфейса.
 *
 * Ядро при первом запуске создаёт только папку: подпись зависит от языка,
 * которого ядро не знает (ADR 0039). Нетронутым считается профиль, чьё
 * название совпадает с идентификатором; переименованный пользователем
 * не трогается. Отказ не мешает работе: остаётся подпись «work».
 */
async function nameDefaultProfile(): Promise<void> {
  if (defaultNamed) return;
  defaultNamed = true;

  const profile = profiles.items.find(
    (item) => item.id === profiles.defaultId && item.title === item.id,
  );
  if (!profile) return;

  try {
    const renamed = await invoke<Profile>("profile_rename", {
      id: profile.id,
      title: t("profiles.defaultTitle"),
    });
    await reload();
    write(JOURNAL_CORE_SOURCE, "result", "journal.profiles.defaultNamed", {
      id: profile.id,
      title: renamed.title,
    });
  } catch (error) {
    write(JOURNAL_CORE_SOURCE, "error", "journal.profiles.defaultNameError", {
      reason: error,
    });
  }
}

/**
 * Читает профили для интерфейса.
 *
 * Ошибка не стирает уже показанный список: профиль мог быть переименован
 * на другой машине, и пустое меню выглядело бы потерей данных.
 */
export async function loadProfiles(): Promise<void> {
  if (status.list.loading) return;

  status.list.loading = true;
  status.list.error = null;
  try {
    await reload();
    await nameDefaultProfile();
  } catch (error) {
    status.list.error = describeError(error);
    write(JOURNAL_CORE_SOURCE, "error", "journal.profiles.readError", {
      reason: error,
    });
  } finally {
    status.list.loading = false;
  }
}

/**
 * Читает счётчики профилей.
 *
 * Отдельно от списка: сайдбару они не нужны, а обход папок на сетевой шаре
 * не должен задерживать открытие меню. Ошибка не стирает прежние числа:
 * они могли остаться верными, а пустые счётчики выглядели бы потерей данных.
 */
export async function loadProfilesUsage(): Promise<void> {
  if (status.usage.loading) return;

  status.usage.loading = true;
  status.usage.error = null;
  try {
    await reloadUsage();
  } catch (error) {
    status.usage.error = describeError(error);
    notifyError(error, "profile-usage");
    write(JOURNAL_CORE_SOURCE, "error", "journal.profiles.usageError", {
      reason: error,
    });
  } finally {
    status.usage.loading = false;
  }
}

/** Создаёт профиль из названия. `true` — создан, форму можно очищать. */
export async function createProfile(title: string): Promise<boolean> {
  if (status.create.loading) return false;

  status.create.loading = true;
  status.create.error = null;
  try {
    const created = await invoke<Profile>("profile_create", { title });
    write(JOURNAL_CORE_SOURCE, "result", "journal.profiles.created", {
      title: created.title,
      id: created.id,
    });
    await reload();
    await refreshUsage();
    return true;
  } catch (error) {
    status.create.error = describeError(error);
    notifyError(error, "profile-create");
    write(JOURNAL_CORE_SOURCE, "error", "journal.profiles.createError", {
      reason: error,
    });
    return false;
  } finally {
    status.create.loading = false;
  }
}

/** Переименовывает профиль: папка остаётся на месте. */
export async function renameProfile(id: string, title: string): Promise<boolean> {
  if (status.rename.loading) return false;

  status.rename.loading = true;
  status.rename.error = null;
  try {
    const renamed = await invoke<Profile>("profile_rename", { id, title });
    write(JOURNAL_CORE_SOURCE, "result", "journal.profiles.renamed", {
      id,
      title: renamed.title,
    });
    await reload();
    return true;
  } catch (error) {
    status.rename.error = describeError(error);
    notifyError(error, "profile-rename");
    write(JOURNAL_CORE_SOURCE, "error", "journal.profiles.renameError", {
      reason: error,
    });
    return false;
  } finally {
    status.rename.loading = false;
  }
}

/** Удаляет профиль в `local/trash/`. */
export async function deleteProfile(profile: Profile): Promise<boolean> {
  if (status.delete.loading) return false;

  status.delete.loading = true;
  status.delete.error = null;
  try {
    const target = await invoke<string>("profile_delete", { id: profile.id });
    write(JOURNAL_CORE_SOURCE, "result", "journal.profiles.moved", {
      title: profile.title,
      target,
    });
    await reload();
    await refreshUsage();
    notify({
      kind: "info",
      code: "notifications.profiles.deleted",
      params: { title: profile.title },
      group: "profile-delete",
    });
    return true;
  } catch (error) {
    status.delete.error = describeError(error);
    notifyError(error, "profile-delete");
    write(JOURNAL_CORE_SOURCE, "error", "journal.profiles.deleteError", {
      reason: error,
    });
    return false;
  } finally {
    status.delete.loading = false;
  }
}

/**
 * Переключает активный профиль и перезапускает приложение.
 *
 * Сначала сбрасывается рабочее пространство: перезапуск не проходит через
 * обработчик закрытия окна, и отложенная запись иначе пропала бы вместе
 * с процессом. Перезапуск просит сама команда ядра — отдельного шага нет,
 * иначе окно оставалось бы с настройками нового профиля и сеансом старого.
 * Запись журнала идёт до вызова: после перезапуска окно уже не живо.
 */
export async function switchProfile(id: string): Promise<void> {
  if (status.switch.loading) return;

  status.switch.loading = true;
  status.switch.error = null;
  try {
    const target = profiles.items.find((profile) => profile.id === id);
    await flushWorkspace();
    write(JOURNAL_CORE_SOURCE, "info", "journal.profiles.switching", {
      title: target?.title ?? id,
    });
    await invoke("profile_switch", { id });
  } catch (error) {
    status.switch.error = describeError(error);
    notifyError(error, "profile-switch");
    write(JOURNAL_CORE_SOURCE, "error", "journal.profiles.switchError", {
      reason: error,
    });
  } finally {
    status.switch.loading = false;
  }
}

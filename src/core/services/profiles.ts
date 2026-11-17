// Профили: список, создание, переименование, удаление и переключение.
//
// Профиль — папка `profiles/<id>/` (ADR 0010). Список всегда читается
// из папки, отдельного реестра нет, поэтому единственный источник правды —
// ядро. Здесь живёт состояние для интерфейса и сценарии, а не разметка:
// меню сайдбара и раздел настроек показывают одно и то же.
//
// Переключение применяется перезапуском: сервисы читают папку профиля один
// раз при старте. Рабочее пространство при этом лежит в `local/` и общее для
// профилей — сохраняется перед перезапуском, иначе последняя правка терялась бы.

import { invoke } from "@tauri-apps/api/core";
import { computed, reactive } from "vue";
import type { Profile, ProfileList } from "@/contracts/profiles";
import { t } from "@/core/infra/i18n";
import { JOURNAL_CORE_SOURCE } from "../infra/constants";
import { describeError } from "../infra/errors";
import { write } from "../infra/journal";
import { idle, type OperationStatus } from "../infra/status";
import { flushWorkspace } from "./workspace/index";

/** Идентификатор профиля, который ядро создаёт при первом запуске (ADR 0010). */
const DEFAULT_PROFILE_ID = "work";

/** Операции, у каждой своё состояние: отказ создания не блокирует список. */
export type ProfileOperation = "list" | "create" | "rename" | "delete" | "switch";

/** Состояние списка профилей. */
export interface ProfilesState {
  /** Идентификатор активного профиля; пусто, пока список не прочитан. */
  active: string;
  items: Profile[];
  /** Прочитан ли список хотя бы раз. */
  loaded: boolean;
}

/** Общее состояние профилей. */
export const profiles = reactive<ProfilesState>({
  active: "",
  items: [],
  loaded: false,
});

/** Состояния операций: `status.create.loading`, `status.delete.error` и т. д. */
export const status = reactive<Record<ProfileOperation, OperationStatus>>({
  list: idle(),
  create: idle(),
  rename: idle(),
  delete: idle(),
  switch: idle(),
});

/** Активный профиль или `null`, пока список не прочитан. */
export const activeProfile = computed<Profile | null>(
  () => profiles.items.find((profile) => profile.id === profiles.active) ?? null,
);

/** Перечитывает список профилей. */
async function reload(): Promise<void> {
  const list = await invoke<ProfileList>("profiles_list");
  profiles.active = list.active;
  profiles.items = list.items;
  profiles.loaded = true;
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
    (item) => item.id === DEFAULT_PROFILE_ID && item.title === item.id,
  );
  if (!profile) return;

  try {
    const renamed = await invoke<Profile>("profile_rename", {
      id: profile.id,
      title: t("profiles.defaultTitle"),
    });
    await reload();
    write(
      JOURNAL_CORE_SOURCE,
      "result",
      `профиль «${profile.id}» назван «${renamed.title}»`,
    );
  } catch (error) {
    write(
      JOURNAL_CORE_SOURCE,
      "error",
      `профиль по умолчанию не назван: ${describeError(error)}`,
    );
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
    write(
      JOURNAL_CORE_SOURCE,
      "error",
      `профили не прочитаны: ${status.list.error}`,
    );
  } finally {
    status.list.loading = false;
  }
}

/** Создаёт профиль из названия. `true` — создан, форму можно очищать. */
export async function createProfile(title: string): Promise<boolean> {
  if (status.create.loading) return false;

  status.create.loading = true;
  status.create.error = null;
  try {
    const created = await invoke<Profile>("profile_create", { title });
    write(
      JOURNAL_CORE_SOURCE,
      "result",
      `создан профиль «${created.title}» (${created.id})`,
    );
    await reload();
    return true;
  } catch (error) {
    status.create.error = describeError(error);
    write(JOURNAL_CORE_SOURCE, "error", `профиль не создан: ${status.create.error}`);
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
    write(
      JOURNAL_CORE_SOURCE,
      "result",
      `профиль «${id}» переименован в «${renamed.title}»`,
    );
    await reload();
    return true;
  } catch (error) {
    status.rename.error = describeError(error);
    write(
      JOURNAL_CORE_SOURCE,
      "error",
      `профиль не переименован: ${status.rename.error}`,
    );
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
    write(
      JOURNAL_CORE_SOURCE,
      "result",
      `профиль «${profile.title}» перемещён в «${target}»`,
    );
    await reload();
    return true;
  } catch (error) {
    status.delete.error = describeError(error);
    write(JOURNAL_CORE_SOURCE, "error", `профиль не удалён: ${status.delete.error}`);
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
 * с процессом.
 */
export async function switchProfile(id: string): Promise<void> {
  if (status.switch.loading) return;

  status.switch.loading = true;
  status.switch.error = null;
  try {
    const target = profiles.items.find((profile) => profile.id === id);
    await flushWorkspace();
    await invoke("profile_switch", { id });
    write(
      JOURNAL_CORE_SOURCE,
      "info",
      `переключение на профиль «${target?.title ?? id}», перезапуск приложения`,
    );
    await invoke("app_restart");
  } catch (error) {
    status.switch.error = describeError(error);
    write(
      JOURNAL_CORE_SOURCE,
      "error",
      `профиль не переключён: ${status.switch.error}`,
    );
  } finally {
    status.switch.loading = false;
  }
}

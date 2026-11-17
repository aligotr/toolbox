// Шаблоны вкладок: список, сохранение, переименование, копия и удаление.
//
// Шаблон — файл `profiles/<id>/templates/<templateId>.json` (ADR 0011).
// Содержимое файла принадлежит ядру: оно выдаёт геометрию как непроверенный
// JSON, а разбор колонок делает домен вкладок
// (`core/services/workspace/layout.ts`). Так новое свойство колонки
// не требует правки Rust и не роняет список шаблонов.
//
// Применение шаблона живёт в домене вкладок
// (`core/services/workspace/index.ts`): это правка вкладки,
// а не работа с файлами шаблонов.

import { invoke } from "@tauri-apps/api/core";
import { reactive } from "vue";
import type {
  StoredTemplate,
  StoredTemplateList,
} from "@/contracts/templates";
import type { TabColumn } from "@/contracts/workspace";
import { t } from "@/core/infra/i18n";
import { JOURNAL_CORE_SOURCE } from "../../infra/constants";
import { describeError } from "../../infra/errors";
import { write } from "../../infra/journal";
import { parseColumns } from "../workspace/layout";
import { idle, type OperationStatus } from "../../infra/status";

/** Шаблон после разбора: геометрия проверена. */
export interface Template {
  id: string;
  title: string;
  /** Колонки с инструментами и ширинами. */
  layout: TabColumn[];
}

/** Операции над шаблонами: отказ удаления не блокирует создание. */
export type TemplateOperation =
  | "list"
  | "create"
  | "update"
  | "rename"
  | "duplicate"
  | "delete";

/** Состояние списка шаблонов. */
export interface TemplatesState {
  items: Template[];
  /** Прочитан ли список хотя бы раз. */
  loaded: boolean;
}

/** Общее состояние шаблонов активного профиля. */
export const templates = reactive<TemplatesState>({ items: [], loaded: false });

/** Состояния операций: `status.create.loading`, `status.delete.error` и т. д. */
export const status = reactive<Record<TemplateOperation, OperationStatus>>({
  list: idle(),
  create: idle(),
  update: idle(),
  rename: idle(),
  duplicate: idle(),
  delete: idle(),
});

/** Перечитывает список шаблонов. */
async function reload(): Promise<void> {
  const list = await invoke<StoredTemplateList>("templates_list");

  // Испорченный файл не мешает остальным, но причину пользователь должен
  // видеть: иначе шаблон просто исчез бы из списка.
  for (const warning of list.warnings) {
    write(JOURNAL_CORE_SOURCE, "error", describeError(warning));
  }

  templates.items = list.items.map((item: StoredTemplate) => ({
    id: item.id,
    title: item.title,
    layout: parseColumns(item.layout),
  }));
  templates.loaded = true;
}

/**
 * Читает шаблоны для интерфейса.
 *
 * Ошибка не стирает уже показанный список: шаблон мог быть добавлен
 * на другой машине, и пустые карточки выглядели бы потерей данных.
 */
export async function loadTemplates(): Promise<void> {
  if (status.list.loading) return;

  status.list.loading = true;
  status.list.error = null;
  try {
    await reload();
  } catch (error) {
    status.list.error = describeError(error);
    write(
      JOURNAL_CORE_SOURCE,
      "error",
      `шаблоны не прочитаны: ${status.list.error}`,
    );
  } finally {
    status.list.loading = false;
  }
}

/** Сохраняет геометрию вкладки шаблоном. `null` — сохранить не удалось. */
export async function createTemplate(
  title: string,
  layout: TabColumn[],
): Promise<Template | null> {
  if (status.create.loading) return null;

  status.create.loading = true;
  status.create.error = null;
  try {
    const created = await invoke<StoredTemplate>("template_create", { title, layout });
    write(
      JOURNAL_CORE_SOURCE,
      "result",
      `сохранён шаблон «${created.title}» (${created.id})`,
    );
    await reload();
    return { id: created.id, title: created.title, layout: parseColumns(created.layout) };
  } catch (error) {
    status.create.error = describeError(error);
    write(JOURNAL_CORE_SOURCE, "error", `шаблон не сохранён: ${status.create.error}`);
    return null;
  } finally {
    status.create.loading = false;
  }
}

/**
 * Обновляет геометрию шаблона из вкладки.
 *
 * Название и незнакомые ключи файла остаются прежними: обновление — это
 * смена раскладки, а не переименование. Обновлённый шаблон возвращается,
 * чтобы вкладка, из которой его сохранили, сразу свернула ревизии.
 */
export async function updateTemplateLayout(
  id: string,
  layout: TabColumn[],
): Promise<Template | null> {
  if (status.update.loading) return null;

  status.update.loading = true;
  status.update.error = null;
  try {
    const updated = await invoke<StoredTemplate>("template_update", { id, layout });
    write(
      JOURNAL_CORE_SOURCE,
      "result",
      `шаблон «${updated.title}» обновлён из вкладки`,
    );
    await reload();
    return {
      id: updated.id,
      title: updated.title,
      layout: parseColumns(updated.layout),
    };
  } catch (error) {
    status.update.error = describeError(error);
    write(
      JOURNAL_CORE_SOURCE,
      "error",
      `шаблон не обновлён: ${status.update.error}`,
    );
    return null;
  } finally {
    status.update.loading = false;
  }
}

/** Переименовывает шаблон: файл остаётся на месте. */
export async function renameTemplate(id: string, title: string): Promise<boolean> {
  if (status.rename.loading) return false;

  status.rename.loading = true;
  status.rename.error = null;
  try {
    const renamed = await invoke<StoredTemplate>("template_rename", { id, title });
    write(
      JOURNAL_CORE_SOURCE,
      "result",
      `шаблон «${id}» переименован в «${renamed.title}»`,
    );
    await reload();
    return true;
  } catch (error) {
    status.rename.error = describeError(error);
    write(
      JOURNAL_CORE_SOURCE,
      "error",
      `шаблон не переименован: ${status.rename.error}`,
    );
    return false;
  } finally {
    status.rename.loading = false;
  }
}

/** Дублирует шаблон: копия получает приписку из словаря. */
export async function duplicateTemplate(id: string): Promise<boolean> {
  if (status.duplicate.loading) return false;

  status.duplicate.loading = true;
  status.duplicate.error = null;
  try {
    const copy = await invoke<StoredTemplate>("template_duplicate", {
      id,
      suffix: t("templates.copySuffix"),
    });
    write(JOURNAL_CORE_SOURCE, "result", `шаблон «${id}» скопирован как «${copy.title}»`);
    await reload();
    return true;
  } catch (error) {
    status.duplicate.error = describeError(error);
    write(
      JOURNAL_CORE_SOURCE,
      "error",
      `шаблон не скопирован: ${status.duplicate.error}`,
    );
    return false;
  } finally {
    status.duplicate.loading = false;
  }
}

/** Удаляет шаблон в `local/trash/templates/`. */
export async function deleteTemplate(template: Template): Promise<boolean> {
  if (status.delete.loading) return false;

  status.delete.loading = true;
  status.delete.error = null;
  try {
    const target = await invoke<string>("template_delete", { id: template.id });
    write(
      JOURNAL_CORE_SOURCE,
      "result",
      `шаблон «${template.title}» перемещён в «${target}»`,
    );
    await reload();
    return true;
  } catch (error) {
    status.delete.error = describeError(error);
    write(JOURNAL_CORE_SOURCE, "error", `шаблон не удалён: ${status.delete.error}`);
    return false;
  } finally {
    status.delete.loading = false;
  }
}

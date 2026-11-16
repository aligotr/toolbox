// Общий сценарий переименования: профили и шаблоны правят название одинаково.
//
// Форма открывается по нажатию, закрывается только после успешной записи
// и не отправляет пустое название. Правила одинаковы в обоих разделах,
// поэтому живут здесь, а не двумя копиями в SFC. Запись приходит снаружи:
// домен знает, какой сервис звать, а сценарий — только название и статус
// операции.

import { ref } from "vue";
import type { OperationStatus } from "@/core/infra/status";

/** Запись, у которой можно сменить название. */
interface Renamable {
  id: string;
  title: string;
}

/** Сохранение названия: `true` — запись прошла, форма закрывается. */
type SaveTitle = (id: string, title: string) => Promise<boolean>;

export function useRename<T extends Renamable>(
  save: SaveTitle,
  status: OperationStatus,
) {
  /** Идентификатор записи, которую сейчас переименовывают. */
  const renamingId = ref<string | null>(null);

  /** Новое название; до отправки живёт в форме. */
  const title = ref("");

  /** Открывает форму и подставляет текущее название. */
  function start(item: T): void {
    renamingId.value = item.id;
    title.value = item.title;
    status.error = null;
  }

  /** Закрывает форму, ничего не записывая. */
  function cancel(): void {
    renamingId.value = null;
    title.value = "";
    status.error = null;
  }

  /** Записывает название; пустое не отправляется. */
  async function submit(item: T): Promise<void> {
    const next = title.value.trim();
    if (!next) return;

    if (await save(item.id, next)) {
      renamingId.value = null;
      title.value = "";
    }
  }

  return { renamingId, title, start, cancel, submit };
}

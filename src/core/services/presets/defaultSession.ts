// Загрузка пресета по умолчанию в новую ячейку инструмента.
//
// Признак свежести ячейки гаснет при первом обращении: в уже открытую вкладку
// пресет не приходит, а новая вкладка даёт новый ключ и снова включает
// загрузку. Пропавший или неразобранный пресет оставляет вкладку пустой,
// а причину пишет в журнал: тихо подменять настройки нельзя.
//
// `canApply` нужен инструменту, у которого ввод мог появиться, пока читался
// список: пресет не должен затирать правку без подтверждения.

import { write } from "@/core/infra/journal";
import { takeFreshCell } from "@/core/services/workspace/index";
import type { Preset, PresetApplyResult, Presets } from "./index";

/** Данные инструмента для загрузки пресета по умолчанию. */
export interface DefaultPresetOptions<TSession> {
  presets: Presets;
  /** Переносит настройки пресета в сеанс. */
  apply(session: TSession, preset: Preset): Promise<PresetApplyResult>;
  /** Источник записей инструмента в журнале. */
  journalSource: string;
  /** Код записи о пропавшем пресете по умолчанию. */
  missingCode: string;
  /** Сеанс ещё не тронут: пресет можно применить. */
  canApply?(session: TSession): boolean;
}

/**
 * Создаёт загрузку пресета по умолчанию для одного инструмента.
 *
 * Возвращённая функция вызывается при монтировании экрана: признак свежести
 * делает её безопасной при повторном показе вкладки.
 */
export function createDefaultPresetLoader<TSession>(
  options: DefaultPresetOptions<TSession>,
): (session: TSession, cellKey: string) => Promise<void> {
  return async function applyDefaultPreset(session, cellKey) {
    if (!takeFreshCell(cellKey)) return;

    if (!options.presets.state.loaded) await options.presets.load();

    if (options.canApply && !options.canApply(session)) return;

    const id = options.presets.state.defaultId;
    if (id === null) return;

    const preset = options.presets.state.items.find((item) => item.id === id);
    if (!preset) {
      write(options.journalSource, "error", options.missingCode, { id });
      return;
    }

    const result = await options.apply(session, preset);
    if (result.error !== null) {
      write(options.journalSource, "error", result.error.code, result.error.params);
      return;
    }
    for (const warning of result.warnings) {
      write(options.journalSource, "info", warning.code, warning.params);
    }
  };
}

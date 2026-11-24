// Связывание сеанса инструмента с пресетом.
//
// Общий механизм для всех инструментов (ADR 0028, ADR 0072): сеанс помнит
// `presetId`, `presetTitle` и снимок настроек, а «изменён» считается
// сравнением текущего снимка с сохранённым. Что входит в снимок, знает
// инструмент: он приносит `capture` и `parse`.
//
// Снимок снимается до записи: правка во время сохранения не должна пометить
// сеанс совпадающим с файлом, которого она не касалась.

import type { Preset, Presets } from "./index";

/** Поля сеанса, которыми владеет подсистема пресетов. */
export interface PresetBinding {
  presetId: string | null;
  presetTitle: string | null;
  presetSnapshot: string | null;
}

/** Формат настроек инструмента для снимка и файла пресета. */
export interface SessionPresetFormat<TSession extends PresetBinding, TPayload> {
  /** Собирает настройки сеанса: то, что сохраняет пресет. */
  capture(session: TSession): TPayload;
  /** Разбирает настройки из файла; `null` - формат не распознан. */
  parse(payload: unknown): { payload: TPayload } | null;
}

/** Данные инструмента для привязки сеанса к пресету. */
export interface SessionPresetsOptions<
  TSession extends PresetBinding,
  TPayload,
> extends SessionPresetFormat<TSession, TPayload> {
  presets: Presets;
}

/** Привязка сеанса к пресету и сравнение настроек. */
export interface SessionPresets<TSession extends PresetBinding, TPayload> {
  /** Изменены ли настройки относительно сохранённого пресета. */
  changed(session: TSession): boolean;
  /** Сохраняет текущие настройки в пресет, к которому привязан сеанс. */
  saveCurrent(session: TSession): Promise<Preset | null>;
  /** Создаёт пресет из текущих настроек и привязывает к нему сеанс. */
  createFromSession(session: TSession, title: string): Promise<Preset | null>;
  /** Привязывает сеанс к пресету и запоминает снимок текущих настроек. */
  adopt(session: TSession, preset: Preset): void;
  /** Обновляет название привязки после переименования открытого пресета. */
  adoptTitle(session: TSession, preset: Preset): void;
  /** Снимает привязку, если удалён открытый пресет. */
  releaseDeleted(session: TSession, presetId: string): void;
  /** Снимок настроек сеанса в виде строки. */
  snapshotOf(session: TSession): string;
  /** Разбирает снимок, снятый при загрузке или сохранении пресета. */
  readSnapshot(session: TSession): TPayload | null;
  /** Собирает настройки сеанса в форме пресета. */
  capture(session: TSession): TPayload;
}

/** Создаёт привязку сеанса к пресетам одного инструмента. */
export function createSessionPresets<TSession extends PresetBinding, TPayload>(
  options: SessionPresetsOptions<TSession, TPayload>,
): SessionPresets<TSession, TPayload> {
  /** Снимок текущих настроек: порядок полей задаёт `capture`. */
  function snapshotOf(session: TSession): string {
    return JSON.stringify(options.capture(session));
  }

  /** Запоминает привязку и готовый снимок настроек. */
  function bind(session: TSession, preset: Preset, snapshot: string): void {
    session.presetId = preset.id;
    session.presetTitle = preset.title;
    session.presetSnapshot = snapshot;
  }

  function adopt(session: TSession, preset: Preset): void {
    bind(session, preset, snapshotOf(session));
  }

  function changed(session: TSession): boolean {
    if (session.presetId === null || session.presetSnapshot === null) return false;
    return snapshotOf(session) !== session.presetSnapshot;
  }

  async function saveCurrent(session: TSession): Promise<Preset | null> {
    if (session.presetId === null) return null;

    const payload = options.capture(session);
    const snapshot = JSON.stringify(payload);
    const saved = await options.presets.update(session.presetId, payload);
    if (saved) bind(session, saved, snapshot);
    return saved;
  }

  async function createFromSession(session: TSession, title: string): Promise<Preset | null> {
    const payload = options.capture(session);
    const snapshot = JSON.stringify(payload);
    const created = await options.presets.create(title, payload);
    if (created) bind(session, created, snapshot);
    return created;
  }

  function adoptTitle(session: TSession, preset: Preset): void {
    if (session.presetId === preset.id) session.presetTitle = preset.title;
  }

  function releaseDeleted(session: TSession, presetId: string): void {
    if (session.presetId !== presetId) return;
    session.presetId = null;
    session.presetTitle = null;
    session.presetSnapshot = null;
  }

  function readSnapshot(session: TSession): TPayload | null {
    if (session.presetSnapshot === null) return null;

    try {
      return options.parse(JSON.parse(session.presetSnapshot))?.payload ?? null;
    } catch {
      // Снимок собран этим же механизмом, но испорченное значение не должно
      // ронять экран: откат просто откажет.
      return null;
    }
  }

  return {
    changed,
    saveCurrent,
    createFromSession,
    adopt,
    adoptTitle,
    releaseDeleted,
    snapshotOf,
    readSnapshot,
    capture: options.capture,
  };
}

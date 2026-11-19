<script setup lang="ts">
// Раздел «Язык»: два встроенных языка и внешние словари (ADR 0039, 0057).
//
// Встроенные `ru` и `en` всегда на месте. Внешний словарь - файл пользователя:
// приложение его не меняет. Недостающие ключи отдаются отдельным файлом,
// а устаревший перекрытый язык возвращают кнопкой «Вернуть встроенный».

import Button from "primevue/button";
import { useConfirm } from "primevue/useconfirm";
import { computed, onMounted, onUnmounted } from "vue";
import { describeError } from "@/core/infra/errors";
import { t } from "@/core/infra/i18n";
import { openFolder, status as appStatus } from "@/core/services/appInfo";
import {
  activateLanguage,
  BUILTIN_LANGUAGE,
  checkLanguageFile,
  exportLanguage,
  exportLanguageSample,
  exportMissing,
  languages,
  loadLanguages,
  revertLanguage,
  status,
  type LanguageEntry,
} from "@/core/services/languages";
import { setLanguage, settings } from "@/core/services/settings/index";
import { requireConfirm } from "@/ui/confirmPopup";

const confirm = useConfirm();

let switching = false;

/**
 * Переключает язык и сразу проверяет недостающие ключи.
 *
 * Это тот же путь, что на старте: недостающие ключи пишет ядро в файл
 * дополнений и уведомляет о записи. Без проверки пропуски появились бы
 * только после перезапуска (ADR 0057).
 */
async function switchLanguage(code: string): Promise<void> {
  if (switching || settings.current?.ui.language === code) return;

  switching = true;
  try {
    if (await setLanguage(code)) await checkLanguageFile(code);
  } finally {
    switching = false;
  }
}

/** Можно ли выбрать язык: битый внешний без встроенного не выбирается. */
function isSelectable(entry: LanguageEntry): boolean {
  return entry.problem === null || entry.overrides;
}

/** Клик по карточке выбирает язык; кнопки действий этого не делают. */
function select(entry: LanguageEntry): void {
  if (!isSelectable(entry) || current.value === entry.code) return;
  current.value = entry.code;
}

/** Выбранный язык: пишется в настройки, применяется и проверяется сразу. */
const current = computed({
  get: () => settings.current?.ui.language ?? BUILTIN_LANGUAGE,
  set: (code: string) => {
    void switchLanguage(code);
  },
});

/** Найденная строка выбранного языка. */
const active = computed(() => languages.items.find((item) => item.code === current.value) ?? null);

/** Файлы, которые не прочитаны: причина показывается под списком. */
const broken = computed(() => languages.items.filter((item) => item.problem !== null));

/** Выбранный файл пропал или не читается: интерфейс показывает русский. */
const lost = computed(() => {
  if (!languages.loaded || current.value === BUILTIN_LANGUAGE) return false;
  return active.value === null || active.value.problem !== null;
});

/** Перечитывает папку и применяет правки действующего словаря. */
async function refresh(): Promise<void> {
  await loadLanguages();
  await activateLanguage(current.value);
}

/** Возврат фокуса в окно: правки файла подхватываются без кнопки. */
function onFocus(): void {
  void refresh();
}

/** Выгружает встроенный язык во внешний файл. */
async function exportBuiltin(entry: LanguageEntry): Promise<void> {
  const path = await exportLanguage(entry.code);
  if (path !== null) await refresh();
}

/** Возвращает встроенный язык: файл уходит в корзину. */
async function restoreBuiltin(entry: LanguageEntry): Promise<void> {
  const target = await revertLanguage(entry.code);
  if (target !== null) await refresh();
}

/** Спрашивает подтверждение возврата к встроенному языку. */
function requestRevert(event: Event, entry: LanguageEntry): void {
  requireConfirm(confirm, {
    target: event.currentTarget as HTMLElement,
    message: t("settings.language.revertMessage", { code: entry.code }),
    acceptLabel: t("settings.language.revertAccept"),
    rejectLabel: t("settings.language.revertCancel"),
    accept: () => {
      void restoreBuiltin(entry);
    },
  });
}

/** Подпись языка: встроенные переводятся, внешние показываются как есть. */
function nameOf(entry: LanguageEntry): string {
  return entry.nameKey ? t(entry.nameKey) : entry.name;
}

onMounted(() => {
  void loadLanguages();
  window.addEventListener("focus", onFocus);
});

onUnmounted(() => {
  window.removeEventListener("focus", onFocus);
});
</script>

<template>
  <section class="language wb-section">
    <header class="wb-section__head">
      <h2 class="wb-section__title">{{ t("settings.language.title") }}</h2>
      <p class="wb-section__lead">{{ t("settings.language.lead") }}</p>
    </header>

    <p v-if="lost" class="language__warning">
      {{ t("settings.language.lost") }}
    </p>

    <div class="language__list" role="radiogroup" :aria-label="t('settings.language.current')">
      <div
        v-for="item in languages.items"
        :key="item.code"
        class="language__item"
        :class="{
          'language__item--active': current === item.code,
          'language__item--disabled': !isSelectable(item),
        }"
        @click="select(item)"
      >
        <input
          class="language__radio"
          type="radio"
          name="ui-language"
          :value="item.code"
          v-model="current"
          :disabled="!isSelectable(item)"
          :aria-label="`${nameOf(item)}, ${item.code}`"
          @click.stop
        />

        <span class="language__body">
          <span class="language__name">
            {{ nameOf(item) }}
            <span class="language__code">{{ item.code }}</span>
          </span>

          <span class="language__badges">
            <span v-if="item.problem !== null" class="language__badge language__badge--bad">
              {{ t("settings.language.broken") }}
            </span>
            <span v-else-if="item.overrides" class="language__badge">
              {{ t("settings.language.override") }}
            </span>
            <span v-else-if="item.builtin" class="language__badge language__badge--ok">
              {{ t("settings.language.builtin") }}
            </span>
            <span v-else class="language__badge">
              {{ t("settings.language.external") }}
            </span>

            <span
              v-if="
                item.problem === null && (item.overrides || !item.builtin) && item.missing === 0
              "
              class="language__badge language__badge--ok"
            >
              {{ t("settings.language.complete") }}
            </span>
            <span v-if="item.problem === null && item.missing > 0" class="language__badge">
              {{ t("settings.language.missingCount", { count: item.missing }) }}
            </span>
          </span>
        </span>

        <span class="language__row-actions" @click.stop>
          <Button
            v-if="item.builtin && !item.overrides"
            :label="t('settings.language.exportFile')"
            icon="pi pi-download"
            size="small"
            severity="secondary"
            text
            :loading="status.export.loading"
            @click.stop.prevent="exportBuiltin(item)"
          />
          <Button
            v-if="item.overrides"
            :label="t('settings.language.revert')"
            icon="pi pi-undo"
            size="small"
            severity="danger"
            text
            :loading="status.revert.loading"
            @click.stop.prevent="requestRevert($event, item)"
          />
          <Button
            v-if="(item.overrides || !item.builtin) && item.problem === null"
            :label="t('settings.language.missingExport')"
            icon="pi pi-file-export"
            size="small"
            severity="secondary"
            text
            :loading="status.missing.loading"
            @click.stop.prevent="exportMissing(item)"
          />
        </span>
      </div>
    </div>

    <p
      v-if="active !== null && active.problem === null && active.missing > 0"
      class="language__hint"
    >
      {{ t("settings.language.partial", { count: active.missing }) }}
    </p>

    <p v-if="active !== null && active.extra > 0" class="language__hint">
      {{ t("settings.language.extra", { count: active.extra }) }}
    </p>

    <p v-if="status.list.error" class="language__error">
      {{ status.list.error }}
    </p>
    <p v-if="status.export.error" class="language__error">
      {{ status.export.error }}
    </p>
    <p v-if="status.revert.error" class="language__error">
      {{ status.revert.error }}
    </p>
    <p v-if="status.missing.error" class="language__error">
      {{ status.missing.error }}
    </p>

    <div class="language__actions">
      <Button
        :label="t('settings.language.refresh')"
        icon="pi pi-refresh"
        size="small"
        severity="secondary"
        outlined
        :loading="status.list.loading"
        @click="refresh"
      />
      <Button
        :label="t('settings.language.open_folder')"
        icon="pi pi-folder-open"
        size="small"
        severity="secondary"
        outlined
        :loading="appStatus.folder.loading"
        @click="openFolder('languages')"
      />
      <Button
        :label="t('settings.language.export')"
        icon="pi pi-download"
        size="small"
        severity="secondary"
        text
        :loading="status.export.loading"
        @click="exportLanguageSample"
      />
    </div>

    <p v-for="item in broken" :key="`problem-${item.code}`" class="language__error">
      {{ item.problem ? describeError(item.problem) : "" }}
    </p>
  </section>
</template>

<style scoped>
.language__list {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-sm);
}

/* Карточка: выбор слева, действия отдельной колонкой справа. */
.language__item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ag-space-lg);
  padding: var(--ag-space-lg);
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-md);
  background: var(--ag-surface);
  cursor: pointer;
}

.language__item:not(.language__item--active):hover {
  border-color: var(--ag-border-strong);
}

/* Отметка выбора - цветом действия, а не системным синим. */
.language__radio {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--p-primary-color);
}

.language__item--active {
  border-color: var(--p-primary-color);
  background: var(--p-surface-100);
}

.language__item--disabled {
  cursor: default;
  opacity: 0.7;
}

.language__item--disabled:not(.language__item--active):hover {
  border-color: var(--ag-border);
}

.language__body {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-xs);
  min-width: 0;
}

.language__name {
  display: flex;
  align-items: baseline;
  gap: var(--ag-space-sm);
  font-size: var(--ag-text-sm);
}

.language__code {
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.language__badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ag-space-xs);
}

.language__badge {
  padding: 2px 6px;
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-sm);
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
  white-space: nowrap;
}

.language__badge--ok {
  border-color: var(--p-primary-color);
  color: var(--p-primary-color);
}

.language__badge--bad {
  border-color: var(--ag-danger);
  color: var(--ag-danger);
}

.language__row-actions {
  display: flex;
  align-items: center;
  gap: var(--ag-space-xs);
  flex-wrap: wrap;
  justify-content: flex-end;
}

.language__actions {
  display: flex;
  align-items: center;
  gap: var(--ag-space-sm);
  flex-wrap: wrap;
}

.language__hint {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-sm);
  white-space: pre-line;
}

.language__warning,
.language__error {
  margin: 0;
  color: var(--ag-danger);
  font-size: var(--ag-text-xs);
  line-height: 1.45;
}
</style>

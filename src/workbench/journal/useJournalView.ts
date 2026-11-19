// Состояние экрана журнала: условия показа, порядок и автопауза.
//
// Условия показа и порядок живут на уровне модуля: уход с вкладки
// размонтирует экран, а подобранный взгляд на ленту должен пережить
// возвращение (ADR 0052). Пауза остаётся на экране: вернувшись, экран
// показывает свежее сверху.

import { computed, reactive, ref } from "vue";
import { t } from "@/core/infra/i18n";
import { catalog } from "@/core/infra/i18n/catalog";
import { JOURNAL_LIMIT } from "@/core/infra/constants";
import { journal, journalSource, type JournalEntry } from "@/core/infra/journal";
import {
  countNewer,
  dayKeyOf,
  dayRows,
  matchesFilters,
  orderEntries,
  sourceCounts,
  type JournalFilters,
  type JournalOrder,
} from "./journalList";

/** С какой прокрутки список считается прокрученным: запас на округление. */
const TOP_SLOP = 16;

/** Подобранный взгляд на ленту: переживает уход с вкладки. */
const view = reactive({
  query: "",
  onlyErrors: false,
  sources: [] as string[],
  order: "newest" as JournalOrder,
});

/** Форматы `Intl` дороги в создании, а строк в журнале много. */
let timeFormat: { locale: string; format: Intl.DateTimeFormat } | null = null;
let dayFormat: { locale: string; format: Intl.DateTimeFormat } | null = null;

/** Время записи в языке интерфейса. */
function time(at: number): string {
  if (timeFormat?.locale !== catalog.locale) {
    timeFormat = {
      locale: catalog.locale,
      format: new Intl.DateTimeFormat(catalog.locale, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    };
  }
  return timeFormat.format.format(at);
}

/** Заголовок дня: «Сегодня», «Вчера» или дата. */
function dayLabel(dayKey: number): string {
  const now = new Date();
  if (dayKey === dayKeyOf(now.getTime())) return t("journal.day.today");

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey === dayKeyOf(yesterday.getTime())) return t("journal.day.yesterday");

  if (dayFormat?.locale !== catalog.locale) {
    dayFormat = {
      locale: catalog.locale,
      format: new Intl.DateTimeFormat(catalog.locale, { day: "numeric", month: "long" }),
    };
  }
  return dayFormat.format.format(dayKey);
}

/** Вариант источника в мультивыборе. */
export interface SourceOption {
  source: string;
  /** Подпись со счётчиком: «ядро (12)». */
  label: string;
}

/** Возвращает состояние экрана журнала. */
export function useJournalView() {
  const paused = ref(false);
  const pausedAt = ref(0);
  const snapshot = ref<JournalEntry[]>([]);

  const filters = computed<JournalFilters>(() => ({
    query: view.query,
    onlyErrors: view.onlyErrors,
    sources: view.sources,
  }));

  const base = computed(() => (paused.value ? snapshot.value : journal.entries));
  const filtered = computed(() =>
    base.value.filter((entry) => matchesFilters(entry, filters.value)),
  );
  const ordered = computed(() => orderEntries(filtered.value, view.order));
  const rows = computed(() => dayRows(ordered.value));

  const shown = computed(() => filtered.value.length);
  const total = computed(() => base.value.length);
  const liveTotal = computed(() => journal.entries.length);
  const truncated = computed(() => liveTotal.value >= JOURNAL_LIMIT);
  const pending = computed(() =>
    paused.value ? countNewer(journal.entries, filters.value, pausedAt.value) : 0,
  );

  const sourceOptions = computed<SourceOption[]>(() =>
    sourceCounts(journal.entries).map(({ source, count }) => ({
      source,
      label: t("journal.view.sourceOption", { source: journalSource(source), count }),
    })),
  );

  /** Останавливает ленту: список копируется, новые записи ждут. */
  function pause(): void {
    if (paused.value) return;
    snapshot.value = [...journal.entries];
    pausedAt.value = journal.entries[0]?.id ?? 0;
    paused.value = true;
  }

  /** Возвращает живую ленту. */
  function resume(): void {
    if (!paused.value) return;
    paused.value = false;
    snapshot.value = [];
  }

  /** Прокрутка: у верха лента живая, дальше - на паузе. */
  function onScroll(event: Event): void {
    const target = event.target as HTMLElement;
    if (target.scrollTop <= TOP_SLOP) resume();
    else pause();
  }

  /** Меняет порядок: свежие сверху или старые сверху. */
  function toggleOrder(): void {
    view.order = view.order === "newest" ? "oldest" : "newest";
  }

  return {
    view,
    pending,
    rows,
    shown,
    total,
    liveTotal,
    truncated,
    sourceOptions,
    time,
    dayLabel,
    resume,
    onScroll,
    toggleOrder,
  };
}

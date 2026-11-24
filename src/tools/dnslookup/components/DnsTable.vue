<script setup lang="ts">
// Таблица DNS: строки - домены, колонки - серверы.
//
// Компонент отвечает только за показ и раскрытие. Данные приходят готовыми:
// отфильтрованные строки, выбранные серверы и карта результатов. Поэтому
// таблица не решает, когда запускать проверку, - это дело `useDnslookup`.
//
// «Домен» и «Тип» закреплены слева: при большом числе серверов без этого
// теряется соответствие строки домену. Порядок строк - порядок добавления;
// при включённом `reorderable` строку переносят за свободное место домена
// (текст при этом выделяется мышью, как обычно). Сортировки нет: сравнение
// идёт построчно.
//
// Рамка, раскрытие, перенос строк и отступ закреплённой колонки живут
// в общем `ToolTable`: инструмент приносит только колонки и раскрытие.

import Button from "primevue/button";
import Column from "primevue/column";
import InputText from "primevue/inputtext";
import { computed, nextTick, ref, watch } from "vue";
import { t } from "@/core/infra/i18n";
import PlainSelect from "@/ui/PlainSelect.vue";
import ToolDraftActions from "@/ui/tool/ToolDraftActions.vue";
import ToolExpansionHead from "@/ui/tool/ToolExpansionHead.vue";
import ToolTable from "@/ui/tool/ToolTable.vue";
import {
  DOMAIN_COLUMN_MAX_WIDTH,
  DOMAIN_COLUMN_MIN_WIDTH,
  RECORD_TYPES,
  SERVER_COLUMN_MIN_WIDTH,
  SYSTEM_SERVER_ID,
} from "../constants";
import {
  extraAnswers,
  firstAnswer,
  statusClass,
  statusLabel,
  statusShown,
  verdictLabel,
} from "../cell";
import CellDetails from "./CellDetails.vue";
import type {
  AddRowResult,
  CellDetailsEntry,
  DnsCell,
  DnsRow,
  RecordType,
  RowVerdict,
  ServerOption,
} from "../types";

/** Идентификатор черновой строки: настоящие строки приходят с UUID. */
const DRAFT_ROW_ID = "__draft__";

const props = defineProps<{
  rows: DnsRow[];
  totalRows: number;
  /** Видимые серверные колонки: скрытые не рисуются, но данные целы. */
  servers: ServerOption[];
  /** Все выбранные серверы: в раскрытии показываются и скрытые колонки. */
  expansionServers: ServerOption[];
  cells: Map<string, DnsCell>;
  verdicts: Map<string, RowVerdict>;
  highlightRowId: string | null;
  /** Подсказка к заголовку системного сервера: его адреса приходят от ОС. */
  systemHint: string;
  /** Идёт проверка: смена типа и повтор строки недоступны. */
  busy: boolean;
  /** Тип новой строки: он же значение поля в черновике. */
  defaultType: RecordType;
  /** Добавляет строку: результат решает, закрыть черновик или показать ошибку. */
  add: (input: string, type: RecordType) => AddRowResult;
  /** Перестановка строк перетаскиванием: выключена, пока не включена явно. */
  reorderable?: boolean;
}>();

const emit = defineEmits<{
  "type-changed": [rowId: string, type: RecordType];
  "update:defaultType": [type: RecordType];
  repeat: [rowId: string];
  delete: [rowId: string];
  /** Новый порядок строк: индексы приходят после переноса. */
  reorder: [from: number, to: number];
}>();

/** Черновик: строка добавления живёт первой строкой таблицы. */
const draftOpen = ref(false);
const draftText = ref("");
const draftError = ref<string | null>(null);
const draftBox = ref<HTMLElement | null>(null);

/** Строки таблицы с черновиком сверху: новая запись встаёт первой. */
const tableRows = computed<DnsRow[]>(() =>
  draftOpen.value
    ? [{ id: DRAFT_ROW_ID, input: "", name: "", type: props.defaultType }, ...props.rows]
    : props.rows,
);

const draftPlaceholder = computed(() =>
  props.defaultType === "PTR"
    ? t("dnslookup.view.placeholderPtr")
    : t("dnslookup.view.placeholderDomain"),
);

/** Правка домена снимает прошлую ошибку добавления: сообщение не висит зря. */
watch(draftText, () => {
  draftError.value = null;
});

// Запуск проверки закрывает черновик: строка добавления не спорит с работой.
watch(
  () => props.busy,
  (busy) => {
    if (busy) closeDraft();
  },
);

/** Строка черновика, а не запись сеанса. */
function isDraft(rowId: string): boolean {
  return rowId === DRAFT_ROW_ID;
}

/** Открывает черновик и ставит фокус в поле домена. */
function openDraft(): void {
  if (props.busy) return;
  draftOpen.value = true;
  draftError.value = null;
  void nextTick(() => {
    draftBox.value?.querySelector<HTMLInputElement>("input")?.focus();
  });
}

/** Закрывает черновик без добавления. */
function closeDraft(): void {
  draftOpen.value = false;
  draftText.value = "";
  draftError.value = null;
}

/** Добавляет строку: успех закрывает черновик, ошибка остаётся под полем. */
function submitDraft(): void {
  if (props.busy) return;

  const result = props.add(draftText.value, props.defaultType);
  if (result.kind === "error") {
    draftError.value = result.message;
    return;
  }

  closeDraft();
}

/** Тип в черновике - значение по умолчанию для следующих строк. */
function onDraftTypeChange(event: { value: unknown }): void {
  emit("update:defaultType", event.value as RecordType);
}

// Кнопка добавления стоит в строке фильтров: экран открывает черновик
// через ref, а состояние строки остаётся у таблицы.
defineExpose({ openDraft });

/** Результат ячейки по паре «строка × сервер». */
function cellOf(rowId: string, serverId: string): DnsCell | undefined {
  return props.cells.get(`${rowId}:${serverId}`);
}

/** Подпись ячейки для чтения с экрана: сначала результат, потом статус. */
function cellLabel(server: ServerOption, cell: DnsCell | undefined): string {
  const value = firstAnswer(cell);
  const extra = extraAnswers(cell);
  const status = statusLabel(cell);

  let text = status;
  if (value) {
    text = extra > 0 ? t("dnslookup.table.cellExtra", { value, count: extra }) : value;
    text = `${text} (${status})`;
  }

  return t("dnslookup.table.cellLabel", { server: server.label, text });
}

/** Данные раскрытия: сервер и его результат, включая скрытые колонки. */
function detailsOf(rowId: string): CellDetailsEntry[] {
  return props.expansionServers.map((server) => ({
    server,
    cell: cellOf(rowId, server.id),
  }));
}

/** Подпись вердикта строки; без вердикта - пустая строка. */
function headVerdict(rowId: string): string {
  const verdict = props.verdicts.get(rowId);
  return verdict ? verdictLabel(verdict) : "";
}

/** Оформление вердикта: расхождение предупреждает, совпадение спокойно. */
function verdictClass(rowId: string): string {
  return props.verdicts.get(rowId)?.differs ? "dns-verdict dns-verdict--diff" : "dns-verdict";
}

/** Классы строки: расхождение и недавний дубликат. */
function rowClass(row: DnsRow): string {
  const classes: string[] = [];
  if (isDraft(row.id)) classes.push("tool-table__row--draft");
  if (props.verdicts.get(row.id)?.differs) classes.push("dns-row--diff");
  if (props.highlightRowId === row.id) classes.push("dns-row--highlight");
  return classes.join(" ");
}

/** Тип меняется у строки, а не у копии пропса: значение приходит событием. */
function onTypeChange(rowId: string, event: { value: unknown }): void {
  emit("type-changed", rowId, event.value as RecordType);
}

/** Перенос строки приходит из общей таблицы и уходит экрану как есть. */
function forwardReorder(from: number, to: number): void {
  emit("reorder", from, to);
}
</script>

<template>
  <ToolTable
    class="dns-table"
    :rows="tableRows"
    :total="totalRows"
    :empty-add="t('dnslookup.table.emptyAdd')"
    :empty-filtered="t('dnslookup.table.emptyFiltered')"
    :highlight-id="highlightRowId"
    :row-class="rowClass"
    :reorderable="reorderable === true && !draftOpen"
    :draft-open="draftOpen"
    mark-expanded
    @reorder="forwardReorder"
  >
    <template #notice>
      <slot name="notice" />
    </template>

    <!-- Полоса черновика: поле домена стоит над своей колонкой, тип - ровно
         под заголовком «Тип», кнопки прижаты к правому краю. Ошибка идёт
         отдельной строкой на всю ширину таблицы. -->
    <template #draft>
      <div class="dns-table__draft">
        <div ref="draftBox" class="dns-table__draft-field">
          <InputText
            v-model="draftText"
            size="small"
            :style="{ width: '100%' }"
            :class="{ 'p-invalid': draftError }"
            :placeholder="draftPlaceholder"
            :aria-invalid="draftError !== null"
            :aria-label="t('dnslookup.view.inputAria')"
            @keyup.enter="submitDraft"
            @keyup.esc.stop.prevent="closeDraft"
          />
        </div>
        <div class="dns-table__draft-field dns-table__draft-field--type">
          <PlainSelect
            :model-value="defaultType"
            :options="RECORD_TYPES"
            size="small"
            :style="{ width: 'var(--tool-compact-width)' }"
            :disabled="busy"
            :aria-label="t('dnslookup.view.typeAria')"
            @change="onDraftTypeChange"
          />
        </div>
        <span class="dns-table__draft-fill" aria-hidden="true" />
        <div class="dns-table__draft-actions">
          <ToolDraftActions
            :disabled="busy"
            :cancel-label="t('dnslookup.view.cancelAdd')"
            @accept="submitDraft"
            @cancel="closeDraft"
          />
        </div>
      </div>
      <small v-if="draftError" class="dns-table__draft-error tool-table__draft-error" role="alert">
        {{ draftError }}
      </small>
    </template>

    <template #default="{ isExpanded, toggle }">
      <!-- Ширина колонки — по содержимому: `width: 1%` не даёт таблице
           отдать домену лишнюю ширину. Кнопки стоят у правого края
           колонки, а пустота за текстом остаётся только у коротких имён.
           Нижнюю границу держит `minWidth`, потолок — `maxWidth`: длинное
           имя обрезается многоточием, а не тянет колонку. -->
      <Column
        field="name"
        frozen
        align-frozen="left"
        :style="{
          minWidth: DOMAIN_COLUMN_MIN_WIDTH,
          maxWidth: DOMAIN_COLUMN_MAX_WIDTH,
          width: '1%',
        }"
      >
        <template #header>
          <span class="tool-table__heading">
            <span>{{ t("dnslookup.table.domains") }}</span>
            <sup v-if="totalRows > 0" class="tool-table__count">{{ totalRows }}</sup>
          </span>
        </template>
        <template #body="{ data }">
          <div v-if="!isDraft(data.id)" class="tool-table__cell">
            <div class="tool-table__row">
              <Button
                icon="pi pi-chevron-right"
                size="small"
                text
                severity="secondary"
                class="tool-table__expand"
                :class="{ 'tool-table__expand--open': isExpanded(data.id) }"
                :aria-expanded="isExpanded(data.id)"
                :aria-label="
                  isExpanded(data.id) ? t('dnslookup.table.collapse') : t('dnslookup.table.expand')
                "
                @click="toggle(data.id)"
              />
              <span class="tool-table__name" :data-tool-row="data.id">
                <span class="tool-table__name-text">{{ data.input }}</span>
              </span>
              <Button
                icon="pi pi-refresh"
                size="small"
                text
                severity="secondary"
                :aria-label="t('dnslookup.table.repeat')"
                :disabled="busy"
                @click.stop="emit('repeat', data.id)"
              />
              <Button
                icon="pi pi-trash"
                size="small"
                text
                severity="secondary"
                class="tool-table__delete"
                :aria-label="t('dnslookup.table.delete')"
                :disabled="busy"
                @click.stop="emit('delete', data.id)"
              />
            </div>
            <small v-if="data.name !== data.input" class="tool-table__normalized">
              {{ data.name }}
            </small>
          </div>
        </template>
      </Column>

      <!-- Ширина колонки задаётся шапкой и данными; черновик на неё
           не влияет, поэтому нижняя граница остаётся компактной. -->
      <Column
        field="type"
        :header="t('dnslookup.table.type')"
        frozen
        align-frozen="left"
        :style="{ minWidth: 'calc(var(--tool-compact-width) + 12px)' }"
      >
        <template #body="{ data }">
          <PlainSelect
            v-if="!isDraft(data.id)"
            :model-value="data.type"
            :options="RECORD_TYPES"
            size="small"
            :style="{ width: 'var(--tool-compact-width)' }"
            :disabled="busy"
            :aria-label="t('dnslookup.table.typeAria', { name: data.input })"
            @change="onTypeChange(data.id, $event)"
          />
        </template>
      </Column>

      <Column
        v-for="server in servers"
        :key="server.id"
        :style="{ minWidth: SERVER_COLUMN_MIN_WIDTH }"
      >
        <template #header>
          <div class="dns-table__server">
            <span class="dns-table__server-name">{{ server.label }}</span>
            <i
              v-if="server.id === SYSTEM_SERVER_ID && systemHint"
              v-tooltip.top="systemHint"
              class="pi pi-info-circle dns-table__system-hint"
              :aria-label="systemHint"
              tabindex="0"
            />
          </div>
        </template>

        <template #body="{ data }">
          <button
            v-if="!isDraft(data.id)"
            type="button"
            class="cell"
            :aria-expanded="isExpanded(data.id)"
            :aria-label="cellLabel(server, cellOf(data.id, server.id))"
            @click="toggle(data.id)"
          >
            <span
              v-if="statusShown(cellOf(data.id, server.id))"
              class="cell__status"
              :class="statusClass(cellOf(data.id, server.id))"
            >
              {{ statusLabel(cellOf(data.id, server.id)) }}
            </span>
            <span v-if="firstAnswer(cellOf(data.id, server.id))" class="cell__line">
              <span
                class="cell__value"
                :class="{ 'cell__value--stale': cellOf(data.id, server.id)?.status === 'pending' }"
              >
                {{ firstAnswer(cellOf(data.id, server.id)) }}
              </span>
              <span v-if="extraAnswers(cellOf(data.id, server.id)) > 0" class="cell__more">
                +{{ extraAnswers(cellOf(data.id, server.id)) }}
              </span>
            </span>
          </button>
        </template>
      </Column>
    </template>

    <template #expansion-head="{ data, toggle }">
      <ToolExpansionHead
        :row-name="data.input"
        :collapse-label="t('dnslookup.table.collapseShort')"
        @collapse="toggle(data.id)"
      >
        <span
          v-if="headVerdict(data.id)"
          class="tool-table__expansion-status"
          :class="verdictClass(data.id)"
        >
          {{ headVerdict(data.id) }}
        </span>
      </ToolExpansionHead>
    </template>

    <template #expansion="{ data }">
      <CellDetails :entries="detailsOf(data.id)" />
    </template>
  </ToolTable>
</template>

<style scoped>
/* Полоса черновика: поле стоит над «Доменами», тип - ровно под «Типом»,
   кнопки прижаты к правому краю. Третья дорожка забирает остаток ширины,
   поэтому кнопки не уезжают за край. */
.dns-table__draft {
  display: grid;
  grid-template-columns: var(--tool-frozen-offset, 240px) auto minmax(0, 1fr) auto;
  align-items: center;
  min-width: 0;
  padding-block: var(--ag-space-sm);
}

.dns-table__draft-field {
  min-width: 0;
  padding-inline: var(--ag-space-sm);
}

.dns-table__draft-fill {
  min-width: 0;
}

.dns-table__draft-actions {
  padding-inline: var(--ag-space-sm);
}

/* Ошибка занимает всю ширину полосы, а не одну колонку. */
.dns-table__draft-error {
  padding: 0 var(--ag-space-sm) var(--ag-space-sm);
}

/* Вердикт строки: цвет различает совпадение и расхождение,
   подпись читается и без цвета. */
.dns-verdict {
  color: var(--ag-ok);
}

.dns-verdict--diff {
  color: var(--ag-warn);
}
</style>

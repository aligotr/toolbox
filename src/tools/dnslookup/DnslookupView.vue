<script setup lang="ts">
// Экран инструмента DNS.
//
// Один экран на все случаи: одиночная проверка — это таблица из одной строки,
// пакетная — та же таблица с фильтрами. Строки и результаты живут в сеансе
// по `cellKey`, поэтому переключение вкладок их не теряет.
//
// Здесь только разметка и короткие обработчики: запуск, сравнение, фильтры,
// свои серверы и журнал — в `useDnslookup`, транспорт — в `api.ts`.

import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import InputGroup from "primevue/inputgroup";
import InputText from "primevue/inputtext";
import MultiSelect from "primevue/multiselect";
import Popover from "primevue/popover";
import Select from "primevue/select";
import { useConfirm } from "primevue/useconfirm";
import { computed, ref, watch } from "vue";
import type { ToolCellProps } from "../../contracts/tools";
import DnsTable from "./DnsTable.vue";
import PasteDialog from "./PasteDialog.vue";
import ServerDialog from "./ServerDialog.vue";
import {
  RECORD_TYPES,
  SERVER_LIMIT,
  STATUS_FILTERS,
  SYSTEM_SERVER_ID,
} from "./constants";
import type { RecordType } from "./types";
import { useDnslookup } from "./useDnslookup";

type BadgeTone = "muted" | "ok" | "danger";

const props = defineProps<ToolCellProps>();
const confirm = useConfirm();

const {
  session,
  availableServers,
  selectedServers,
  columnServers,
  hasSystem,
  occupiedAddresses,
  existingKeys,
  canCompare,
  verdicts,
  visibleRows,
  diffCount,
  canRun,
  running,
  addRow,
  addRows,
  addCustomServer,
  removeCustomServer,
  exportCsv: exportCsvAction,
  runAll,
  runRow,
  cancel,
  clear,
  changeType,
  removeRow,
  refreshServers,
} = useDnslookup(props);

const draft = ref("");
const draftType = ref<RecordType>(session.defaultType);
const addError = ref<string | null>(null);
const addBox = ref<HTMLElement | null>(null);
const pasteOpen = ref(false);
const serversOpen = ref(false);
const serverError = ref<string | null>(null);
const exportNote = ref<string | null>(null);
const columnMenu = ref<InstanceType<typeof Popover> | null>(null);

// Тип в поле добавления — значение по умолчанию для новых строк,
// а не фильтр таблицы.
watch(draftType, (value) => {
  session.defaultType = value;
});

/** Русская форма числа: «1 расхождение», «2 расхождения». */
function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

const badge = computed<{ text: string; tone: BadgeTone }>(() => {
  if (session.status.run.loading) return { text: "идёт проверка", tone: "muted" };
  if (session.status.run.error) return { text: "ошибка", tone: "danger" };
  if (session.rows.length > 0) return { text: "готов", tone: "ok" };
  return { text: "пусто", tone: "muted" };
});

const placeholder = computed(() =>
  draftType.value === "PTR" ? "IP-адрес или reverse-имя" : "Введите домен",
);

/** Подсказка о системных резолверах: адреса приходят от ОС, не из настроек. */
const systemHint = computed<string>(() => {
  if (!session.servers.includes(SYSTEM_SERVER_ID)) return "";
  if (session.status.servers.loading) return "Системные резолверы: загрузка…";
  if (session.systemAddresses.length === 0) {
    return "Системные резолверы не найдены";
  }
  return `Системные резолверы: ${session.systemAddresses.join(", ")}`;
});

/** Пояснение к заблокированному фильтру расхождений. */
const compareHint = computed(() =>
  hasSystem.value ? "нужен ещё сервер" : "нужен системный сервер",
);

const summary = computed(() => {
  const parts = [
    `${session.rows.length} ${plural(session.rows.length, "домен", "домена", "доменов")}`,
    `${session.servers.length} ${plural(session.servers.length, "сервер", "сервера", "серверов")}`,
  ];
  if (session.progress.total > 0) {
    parts.push(`${session.progress.done} из ${session.progress.total}`);
  }
  if (diffCount.value > 0) {
    parts.push(
      `${diffCount.value} ${plural(diffCount.value, "расхождение", "расхождения", "расхождений")}`,
    );
  }
  return parts.join(" · ");
});

function focusInput(): void {
  addBox.value?.querySelector<HTMLInputElement>("input")?.focus();
}

/** Добавляет строку; успешное добавление сразу запускает её проверку. */
function submitRow(): void {
  if (running.value) return;

  const result = addRow(draft.value, draftType.value);
  if (result.kind === "error") {
    addError.value = result.message;
    return;
  }

  addError.value = null;
  if (result.kind === "added") draft.value = "";
  focusInput();
}

/** Вставка списка: «Добавить» только добавляет, «и проверить» запускает всё. */
function submitPaste(payload: { lines: string[]; run: boolean }): void {
  const result = addRows(payload.lines, draftType.value);
  pasteOpen.value = false;
  addError.value = result.firstError;
  if (result.added > 0 && payload.run) runAll();
}

/** Очистка во время проверки сначала останавливает её (с подтверждением). */
function requestClear(): void {
  if (!session.status.run.loading) {
    void clear();
    return;
  }

  confirm.require({
    header: "Очистить таблицу",
    message: "Проверка идёт. Остановить её и очистить таблицу?",
    icon: "pi pi-exclamation-triangle",
    acceptLabel: "Очистить",
    rejectLabel: "Отмена",
    accept: () => {
      void clear();
    },
  });
}

function openServers(): void {
  serverError.value = null;
  serversOpen.value = true;
  // Список читается заново: файл профиля могли поправить руками.
  refreshServers();
}

async function submitServer(payload: { label: string; address: string }): Promise<void> {
  serverError.value = null;
  serverError.value = await addCustomServer(payload.label, payload.address);
}

async function deleteServer(serverId: string): Promise<void> {
  serverError.value = null;
  serverError.value = await removeCustomServer(serverId);
}

/** Скрывает или возвращает серверную колонку: данные сеанса не меняются. */
function setColumnVisible(serverId: string, visible: boolean): void {
  if (visible) {
    session.hiddenServers = session.hiddenServers.filter((id) => id !== serverId);
  } else if (!session.hiddenServers.includes(serverId)) {
    session.hiddenServers.push(serverId);
  }
}

function toggleColumns(event: Event): void {
  columnMenu.value?.toggle(event);
}

async function exportCsv(): Promise<void> {
  exportNote.value = null;
  try {
    const result = await exportCsvAction();
    exportNote.value =
      result.method === "clipboard"
        ? `Скачивание недоступно: CSV скопирован в буфер (${result.rows} строк)`
        : result.copied
          ? `Экспортировано строк: ${result.rows} (копия в буфере)`
          : `Экспортировано строк: ${result.rows}`;
  } catch (error) {
    exportNote.value = `Не удалось выгрузить CSV: ${String(error)}`;
  }
}
</script>

<template>
  <section class="dns">
    <header class="dns__head">
      <div class="dns__heading">
        <h1 class="dns__title">DNS</h1>
        <p class="dns__lead">
          Строки — домены, колонки — серверы. Ответы сравниваются с системным
          резолвером, расхождения видны сразу.
        </p>
      </div>
      <span class="dns__badge">
        <i class="dns__badge-dot" :class="`dns__badge-dot--${badge.tone}`" />
        {{ badge.text }}
      </span>
    </header>

    <div class="dns__toolbar">
      <div ref="addBox" class="dns__add">
        <InputGroup>
          <InputText
            v-model="draft"
            :placeholder="placeholder"
            aria-label="Домен или IP-адрес"
            :disabled="running"
            @keyup.enter="submitRow"
          />
          <Select
            v-model="draftType"
            :options="RECORD_TYPES"
            aria-label="Тип записи по умолчанию"
            :disabled="running"
          />
          <Button
            label="Добавить"
            icon="pi pi-plus"
            :disabled="running"
            @click="submitRow"
          />
        </InputGroup>
      </div>

      <Button
        label="Вставить список"
        icon="pi pi-clipboard"
        severity="secondary"
        outlined
        :disabled="running"
        @click="pasteOpen = true"
      />
    </div>

    <div class="dns__servers">
      <span class="dns__label">
        Серверы
        <span class="dns__count">{{ session.servers.length }} из {{ SERVER_LIMIT }}</span>
      </span>
      <div class="dns__servers-row">
        <MultiSelect
          v-model="session.servers"
          :options="availableServers"
          option-label="label"
          option-value="id"
          display="chip"
          :max-selected-labels="SERVER_LIMIT"
          :selection-limit="SERVER_LIMIT"
          placeholder="Выберите серверы"
          aria-label="DNS-серверы"
        />
        <Button
          label="Свой"
          icon="pi pi-server"
          severity="secondary"
          outlined
          @click="openServers"
        />
      </div>
    </div>

    <p v-if="addError" class="dns__error">
      <i class="pi pi-exclamation-circle" aria-hidden="true" />
      {{ addError }}
    </p>

    <p v-if="systemHint" class="dns__hint">
      <i class="pi pi-info-circle" aria-hidden="true" />
      {{ systemHint }}
    </p>

    <p v-if="session.status.servers.error" class="dns__error" role="alert">
      <i class="pi pi-exclamation-circle" aria-hidden="true" />
      Серверы: {{ session.status.servers.error }}
    </p>

    <p v-if="session.status.run.error" class="dns__error" role="alert">
      <i class="pi pi-exclamation-circle" aria-hidden="true" />
      {{ session.status.run.error }}
    </p>

    <div class="dns__filters">
      <InputText
        v-model="session.filters.search"
        class="dns__search"
        placeholder="Поиск по домену"
        aria-label="Поиск по домену"
      />
      <Select
        v-model="session.filters.status"
        :options="STATUS_FILTERS"
        option-label="label"
        option-value="value"
        class="dns__status"
        aria-label="Фильтр по статусу"
      />
      <label class="dns__check">
        <Checkbox
          v-model="session.filters.diffOnly"
          binary
          :disabled="!canCompare"
        />
        <span>
          Только расхождения
          <template v-if="!canCompare"> ({{ compareHint }})</template>
        </span>
      </label>

      <Button
        label="Колонки"
        icon="pi pi-table"
        severity="secondary"
        text
        :disabled="selectedServers.length === 0"
        @click="toggleColumns"
      />
      <Popover ref="columnMenu">
        <ul class="columns">
          <li v-for="server in selectedServers" :key="server.id" class="columns__item">
            <Checkbox
              :input-id="`dns-column-${server.id}`"
              binary
              :model-value="!session.hiddenServers.includes(server.id)"
              @update:model-value="setColumnVisible(server.id, $event)"
            />
            <label :for="`dns-column-${server.id}`" class="columns__label">
              {{ server.label }}
              <small v-if="server.address" class="columns__address">
                {{ server.address }}
              </small>
            </label>
          </li>
        </ul>
      </Popover>
    </div>

    <DnsTable
      :rows="visibleRows"
      :total-rows="session.rows.length"
      :servers="columnServers"
      :expansion-servers="selectedServers"
      :cells="session.cells"
      :verdicts="verdicts"
      :highlight-row-id="session.highlightRowId"
      :busy="running"
      @type-changed="changeType"
      @repeat="runRow"
      @delete="removeRow"
    />

    <footer class="dns__footer">
      <p class="dns__summary" aria-live="polite">{{ summary }}</p>
      <div class="dns__actions">
        <Button
          label="Проверить"
          icon="pi pi-play"
          :disabled="!canRun"
          @click="runAll"
        />
        <Button
          label="Остановить"
          icon="pi pi-stop"
          severity="secondary"
          :disabled="!session.status.run.loading"
          @click="cancel"
        />
        <Button
          label="Очистить"
          icon="pi pi-trash"
          severity="danger"
          text
          :disabled="session.rows.length === 0 && !session.status.run.error"
          @click="requestClear"
        />
        <Button
          label="Экспорт CSV"
          icon="pi pi-download"
          severity="secondary"
          text
          :disabled="visibleRows.length === 0"
          @click="exportCsv"
        />
      </div>
    </footer>

    <p v-if="exportNote" class="dns__hint" aria-live="polite">
      <i class="pi pi-file" aria-hidden="true" />
      {{ exportNote }}
    </p>

    <PasteDialog
      v-model:visible="pasteOpen"
      :type="draftType"
      :existing="existingKeys"
      @submit="submitPaste"
    />

    <ServerDialog
      v-model:visible="serversOpen"
      :servers="session.customServers"
      :occupied="occupiedAddresses"
      :saving="session.status.servers.loading"
      :blocked="session.serversBroken"
      :error="
        serverError ??
        (session.serversBroken ? session.status.servers.error : null)
      "
      @add="submitServer"
      @remove="deleteServer"
    />
  </section>
</template>

<style scoped>
.dns {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.dns__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.dns__heading {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dns__title {
  margin: 0;
  font-size: 28px;
  line-height: 1.25;
}

.dns__lead {
  margin: 0;
  max-width: 720px;
  color: var(--p-text-muted-color);
  font-size: 15px;
}

.dns__badge {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
  padding-top: 8px;
  color: var(--p-text-muted-color);
  font-size: 13px;
}

.dns__badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.dns__badge-dot--ok {
  background: var(--ag-ok);
}

.dns__badge-dot--danger {
  background: var(--ag-danger);
}

.dns__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 16px 24px;
}

.dns__add {
  flex: 1 1 360px;
  min-width: 0;
}

.dns__add :deep(.p-inputtext) {
  flex: 1;
  min-width: 160px;
}

.dns__add :deep(.p-select) {
  min-width: 104px;
}

.dns__servers {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.dns__servers-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.dns__servers-row :deep(.p-multiselect) {
  flex: 1 1 360px;
  min-width: 0;
}

.dns__label {
  color: var(--p-text-muted-color);
  font-size: 13px;
}

.dns__count {
  margin-left: 8px;
}

.dns__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}

.dns__search {
  flex: 0 1 240px;
  min-width: 160px;
}

.dns__status {
  min-width: 150px;
}

.dns__check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--p-text-muted-color);
  font-size: 14px;
}

.dns__error,
.dns__hint {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  font-size: 14px;
}

.dns__error {
  color: var(--ag-danger);
}

.dns__hint {
  color: var(--p-text-muted-color);
}

.dns__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.dns__summary {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 13px;
}

.dns__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.columns {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 8px;
  min-width: 200px;
  list-style: none;
}

.columns__item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.columns__label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 14px;
  cursor: pointer;
}

.columns__address {
  color: var(--p-text-muted-color);
  font-family: var(--ag-font-mono);
  font-size: 12px;
}
</style>

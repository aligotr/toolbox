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
import Chip from "primevue/chip";
import InputGroup from "primevue/inputgroup";
import InputText from "primevue/inputtext";
import MultiSelect from "primevue/multiselect";
import Popover from "primevue/popover";
import Select from "primevue/select";
import { useConfirm } from "primevue/useconfirm";
import { computed, ref, watch } from "vue";
import type { ToolCellProps } from "../../contracts/tools";
import DnsTable from "./DnsTable.vue";
import PresetsDialog from "./PresetsDialog.vue";
import ServerDialog from "./ServerDialog.vue";
import {
  RECORD_TYPES,
  SERVER_LABEL_LIMIT,
  SERVER_LIMIT,
  STATUS_FILTERS,
  SYSTEM_SERVER_ID,
  TOOL_HEADING,
} from "./constants";
import { dnsPresetChanged } from "./presets";
import { useDnslookup } from "./useDnslookup";

const props = defineProps<ToolCellProps>();
const confirm = useConfirm();

const {
  session,
  availableServers,
  selectedServers,
  columnServers,
  hasSystem,
  occupiedAddresses,
  canCompare,
  verdicts,
  visibleRows,
  canRun,
  running,
  addRow,
  addCustomServer,
  removeCustomServer,
  exportCsv: exportCsvAction,
  runAll,
  runRow,
  cancel,
  clear,
  changeType,
  removeRow,
  moveRow,
  refreshServers,
} = useDnslookup(props);

const draft = ref("");
const addError = ref<string | null>(null);
const addBox = ref<HTMLElement | null>(null);
const serversOpen = ref(false);
const presetsOpen = ref(false);
const serverError = ref<string | null>(null);
const exportNote = ref<string | null>(null);
const columnMenu = ref<InstanceType<typeof Popover> | null>(null);

/** Правка домена снимает прошлую ошибку добавления: сообщение не висит зря. */
watch(draft, () => {
  addError.value = null;
});

// Тип в поле добавления — значение по умолчанию для новых строк,
// а не фильтр таблицы. Отдельного состояния нет: загруженный пресет
// меняет `session.defaultType`, и поле показывает то же значение.

/** Настройки разошлись с сохранённым пресетом: подпись у кнопки. */
const presetChanged = computed(() => dnsPresetChanged(session));

const placeholder = computed(() =>
  session.defaultType === "PTR" ? "IP-адрес или reverse-имя" : "Введите домен",
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

/** Первые выбранные серверы в поле: остальные скрыты за многоточием. */
const shownServerIds = computed(() => session.servers.slice(0, SERVER_LABEL_LIMIT));

/** Сколько выбранных серверов не поместилось в поле. */
const overflowServerCount = computed(() =>
  Math.max(session.servers.length - SERVER_LABEL_LIMIT, 0),
);

/** Подпись сервера по идентификатору: своего сервера может уже не быть. */
function serverLabel(serverId: string): string {
  return availableServers.value.find((server) => server.id === serverId)?.label ?? serverId;
}

/** Крестик чипа снимает выбор и не открывает список. */
function unselectServer(serverId: string, event: Event): void {
  event.stopPropagation();
  session.servers = session.servers.filter((id) => id !== serverId);
}

function focusInput(): void {
  addBox.value?.querySelector<HTMLInputElement>("input")?.focus();
}

/** Добавляет строку; успешное добавление сразу запускает её проверку. */
function submitRow(): void {
  if (running.value) return;

  const result = addRow(draft.value, session.defaultType);
  if (result.kind === "error") {
    addError.value = result.message;
    return;
  }

  addError.value = null;
  if (result.kind === "added") draft.value = "";
  focusInput();
}

/** Запуск и остановка — одно действие: во время проверки кнопка отменяет. */
function toggleRun(): void {
  if (running.value) {
    cancel();
  } else {
    runAll();
  }
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
    <h1 class="dns__title">{{ TOOL_HEADING }}</h1>

    <div class="dns__toolbar">
      <div ref="addBox" class="dns__add">
        <InputGroup>
          <InputText
            v-model="draft"
            size="small"
            :class="{ 'p-invalid': addError }"
            :placeholder="addError ?? placeholder"
            :aria-invalid="addError !== null"
            aria-label="Домен или IP-адрес"
            :disabled="running"
            @keyup.enter="submitRow"
          />
          <Select
            v-model="session.defaultType"
            size="small"
            :options="RECORD_TYPES"
            aria-label="Тип записи по умолчанию"
            :disabled="running"
          />
          <Button
            label="Добавить"
            icon="pi pi-plus"
            severity="secondary"
            outlined
            size="small"
            :disabled="running"
            @click="submitRow"
          />
        </InputGroup>
      </div>

      <div class="dns__servers-row">
        <InputGroup class="dns__servers">
          <MultiSelect
            v-model="session.servers"
            size="small"
            :options="availableServers"
            option-label="label"
            option-value="id"
            display="chip"
            :selection-limit="SERVER_LIMIT"
            placeholder="Выберите серверы"
            aria-label="DNS-серверы"
          >
            <template #value="{ placeholder }">
              <template v-if="session.servers.length > 0">
                <Chip
                  v-for="serverId in shownServerIds"
                  :key="serverId"
                  :label="serverLabel(serverId)"
                  removable
                  @remove="unselectServer(serverId, $event)"
                />
                <span
                  v-if="overflowServerCount > 0"
                  class="dns__servers-more"
                  :aria-label="`и ещё ${overflowServerCount}`"
                >
                  +{{ overflowServerCount }}
                </span>
              </template>
              <template v-else>{{ placeholder }}</template>
            </template>
          </MultiSelect>
          <Button
            v-tooltip.top="'Свои DNS-серверы'"
            icon="pi pi-pencil"
            severity="secondary"
            outlined
            size="small"
            aria-label="Свои DNS-серверы"
            @click="openServers"
          />
        </InputGroup>

        <Button
          class="dns__run"
          :label="running ? 'Остановить' : 'Проверить'"
          :icon="running ? 'pi pi-stop' : 'pi pi-play'"
          :severity="running ? 'contrast' : undefined"
          size="small"
          :disabled="!running && !canRun"
          @click="toggleRun"
        />
      </div>
    </div>

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
        size="small"
        placeholder="Поиск по домену"
        aria-label="Поиск по домену"
      />
      <Select
        v-model="session.filters.status"
        :options="STATUS_FILTERS"
        option-label="label"
        option-value="value"
        class="dns__status"
        size="small"
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

      <div class="dns__table-actions">
        <Button
          v-tooltip.top="'Отображаемые колонки'"
          icon="pi pi-table"
          severity="secondary"
          text
          rounded
          size="small"
          aria-label="Отображаемые колонки"
          :disabled="selectedServers.length === 0"
          @click="toggleColumns"
        />
        <Button
          v-tooltip.top="'Экспорт CSV'"
          icon="pi pi-download"
          severity="secondary"
          text
          rounded
          size="small"
          aria-label="Экспорт CSV"
          :disabled="visibleRows.length === 0"
          @click="exportCsv"
        />
        <Button
          v-tooltip.top="'Очистить'"
          icon="pi pi-trash"
          severity="danger"
          text
          rounded
          size="small"
          aria-label="Очистить"
          :disabled="session.rows.length === 0 && !session.status.run.error"
          @click="requestClear"
        />
      </div>
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

    <div class="dns__presets">
      <Button
        label="Пресеты"
        icon="pi pi-bookmark"
        severity="secondary"
        text
        size="small"
        @click="presetsOpen = true"
      />
      <span v-if="session.presetTitle" class="dns__preset">
        <i class="pi pi-bookmark" aria-hidden="true" />
        {{ session.presetTitle }}
        <small v-if="presetChanged" class="dns__preset-changed">
          изменён
        </small>
      </span>
    </div>

    <DnsTable
      class="dns__table"
      :rows="visibleRows"
      :total-rows="session.rows.length"
      :servers="columnServers"
      :expansion-servers="selectedServers"
      :cells="session.cells"
      :verdicts="verdicts"
      :highlight-row-id="session.highlightRowId"
      :system-hint="systemHint"
      :busy="running"
      reorderable
      @type-changed="changeType"
      @repeat="runRow"
      @delete="removeRow"
      @reorder="moveRow"
    />

    <p v-if="exportNote" class="dns__hint" aria-live="polite">
      <i class="pi pi-file" aria-hidden="true" />
      {{ exportNote }}
    </p>

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

    <PresetsDialog v-model:visible="presetsOpen" :session="session" />
  </section>
</template>

<style scoped>
.dns {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
}

/* Строки панели держат общий шаг: заголовок отбивается отдельно,
   остальные блоки — зазором блока. */
.dns > * + * {
  margin-block-start: var(--ag-space-lg);
}

.dns__title + * {
  margin-block-start: var(--ag-space-heading);
}

/* Сжимается только таблица: остальные блоки панели держат свою высоту. */
.dns > :not(.dns__table) {
  flex: none;
}

/* Таблица — главный блок: высота по числу строк. При переполнении
   сжимается и прокручивает тело. */
.dns__table {
  flex: 0 1 auto;
}

/* Заголовок обслуживает данные и не занимает больше строки. */
.dns__title {
  margin: 0;
  font-size: var(--ag-text-xl);
  line-height: 1.25;
}

/* Добавление строки и выбор серверов стоят в одну линию: панель не плодит
   вертикальные этажи, данные начинаются выше. */
.dns__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ag-space-sm);
}

.dns__add {
  flex: 0 0 auto;
  min-width: 0;
}

.dns__add :deep(.p-inputtext) {
  flex: 0 0 var(--ag-field-width);
  min-width: 0;
}

.dns__add :deep(.p-select) {
  flex: 0 0 84px;
  min-width: 84px;
}

/* Ошибка добавления живёт в самом поле: отдельная строка не нужна. */
.dns__add :deep(.p-inputtext.p-invalid)::placeholder {
  color: var(--ag-danger);
}

/* Поле серверов и кнопка запуска — одна единица строки: при нехватке места
   они переносятся вместе, кнопка не остаётся на строке одна. Запуск держится
   у правого края, поле забирает остаток ширины и уступает место подписи.
   `min-width` не обнуляется: строка переносится раньше, чем поле сожмёт
   чипы серверов. */
.dns__servers-row {
  display: flex;
  flex: 1 1 var(--ag-field-width);
  align-items: center;
  gap: var(--ag-space-sm);
  max-width: 100%;
}

/* Кнопка своих серверов прижата к списку: вместе они читаются как один
   контрол, как поле, тип и «Добавить» в строке ввода. */
.dns__servers {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
  max-width: 100%;
}

.dns__servers :deep(.p-multiselect) {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
  max-width: 100%;
}

/* Кнопка запуска держит свою ширину: подпись не сжимается и не
   переносится, когда поле серверов отдаёт или забирает место. */
.dns__run {
  flex: none;
  white-space: nowrap;
}

/* Чипы компактнее: выбранные серверы влезают в общую ширину поля. */
.dns__servers :deep(.p-chip) {
  padding: 0 var(--ag-space-xs);
}

/* Счётчик скрытых серверов: поле не растягивается на весь список. */
.dns__servers-more {
  color: var(--p-text-muted-color);
}

.dns__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ag-space-sm) var(--ag-space-lg);
}

/* Кнопка пресетов стоит отдельной строкой под фильтрами: так её видно
   и на узком окне. Переработка тулбара — отдельная задача. */
.dns__presets {
  display: flex;
  align-items: center;
  gap: var(--ag-space-md);
}

.dns__preset {
  display: inline-flex;
  align-items: center;
  gap: var(--ag-space-sm);
  min-width: 0;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-sm);
}

.dns__preset-changed {
  color: var(--ag-warn);
  font-size: var(--ag-text-xs);
}

.dns__search {
  flex: 0 1 var(--ag-field-width);
  min-width: 160px;
}

.dns__status {
  min-width: 150px;
}

/* Экспорт и очистка — у правого края над таблицей. */
.dns__table-actions {
  display: flex;
  gap: var(--ag-space-sm);
  margin-left: auto;
}

.dns__check {
  display: inline-flex;
  align-items: center;
  gap: var(--ag-space-sm);
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-sm);
}

.dns__error,
.dns__hint {
  display: flex;
  align-items: flex-start;
  gap: var(--ag-space-sm);
  margin: 0;
  font-size: var(--ag-text-sm);
}

.dns__error {
  color: var(--ag-danger);
}

.dns__hint {
  color: var(--p-text-muted-color);
}

.columns {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-sm);
  margin: 0;
  padding: var(--ag-space-sm);
  min-width: 200px;
  list-style: none;
}

.columns__item {
  display: flex;
  align-items: center;
  gap: var(--ag-space-sm);
}

.columns__label {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-xs);
  font-size: var(--ag-text-sm);
  cursor: pointer;
}

.columns__address {
  color: var(--p-text-muted-color);
  font-family: var(--ag-font-mono);
  font-size: var(--ag-text-xs);
}
</style>

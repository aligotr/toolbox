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
import { computed, onMounted, ref, watch } from "vue";
import type { ToolCellProps } from "@/contracts/tools";
import {
  CONFIRM_CALM_REJECT,
  CONFIRM_DANGER_ACCEPT,
} from "@/core/constants";
import DnsTable from "./components/DnsTable.vue";
import PresetBar from "./components/PresetBar.vue";
import PresetsDialog from "./components/PresetsDialog.vue";
import ServerDialog from "./components/ServerDialog.vue";
import {
  RECORD_TYPES,
  SERVER_LABEL_LIMIT,
  SERVER_LIMIT,
  STANDALONE_CELL_KEY,
  STATUS_FILTERS,
  SYSTEM_SERVER_ID,
} from "./constants";
import { applyDefaultPreset } from "./presets";
import { useDnslookup } from "./useDnslookup";
import "./styles.css";

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
const presetNote = ref<string | null>(null);
const serverError = ref<string | null>(null);
const exportNote = ref<string | null>(null);
const columnMenu = ref<InstanceType<typeof Popover> | null>(null);

/** Правка домена снимает прошлую ошибку добавления: сообщение не висит зря. */
watch(draft, () => {
  addError.value = null;
});

// Новая вкладка открывается с пресетом по умолчанию. Признак свежести ячейки
// гасится внутри загрузки, поэтому повторный показ вкладки пресет не тронет.
onMounted(() => {
  void applyDefaultPreset(session, props.cellKey ?? STANDALONE_CELL_KEY);
});

// Тип в поле добавления — значение по умолчанию для новых строк,
// а не фильтр таблицы. Отдельного состояния нет: загруженный пресет
// меняет `session.defaultType`, и поле показывает то же значение.

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
    acceptProps: CONFIRM_DANGER_ACCEPT,
    rejectProps: CONFIRM_CALM_REJECT,
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
    <PresetBar
      :session="session"
      @open="presetsOpen = true"
      @note="presetNote = $event"
    />

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
            </label>
          </li>
        </ul>
      </Popover>
    </div>

    <p v-if="presetNote" class="dns__error" aria-live="polite">
      <i class="pi pi-exclamation-circle" aria-hidden="true" />
      {{ presetNote }}
    </p>

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
      :saving="session.status.serversSave.loading"
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
  font-size: var(--ag-text-sm);
  cursor: pointer;
}
</style>

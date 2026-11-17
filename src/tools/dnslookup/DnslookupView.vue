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
import { t } from "@/core/infra/i18n";
import DnsTable from "./components/DnsTable.vue";
import PresetBar from "./components/PresetBar.vue";
import PresetsDialog from "./components/PresetsDialog.vue";
import ServerDialog from "./components/ServerDialog.vue";
import {
  RECORD_TYPES,
  SERVER_LABEL_LIMIT,
  SERVER_LIMIT,
  STANDALONE_CELL_KEY,
  statusFilterOptions,
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
  session.defaultType === "PTR"
    ? t("dnslookup.view.placeholderPtr")
    : t("dnslookup.view.placeholderDomain"),
);

/** Подсказка о системных резолверах: адреса приходят от ОС, не из настроек. */
const systemHint = computed<string>(() => {
  if (!session.servers.includes(SYSTEM_SERVER_ID)) return "";
  if (session.status.servers.loading) return t("dnslookup.view.systemLoading");
  if (session.systemAddresses.length === 0) {
    return t("dnslookup.view.systemMissing");
  }
  return t("dnslookup.view.systemList", {
    list: session.systemAddresses.join(", "),
  });
});

/** Пояснение к заблокированному фильтру расхождений. */
const compareHint = computed(() =>
  hasSystem.value
    ? t("dnslookup.view.needMoreServer")
    : t("dnslookup.view.needSystemServer"),
);

/** Первые выбранные серверы в поле: остальные скрыты за многоточием. */
const shownServerIds = computed(() => session.servers.slice(0, SERVER_LABEL_LIMIT));

/** Сколько выбранных серверов не поместилось в поле. */
const overflowServerCount = computed(() =>
  Math.max(session.servers.length - SERVER_LABEL_LIMIT, 0),
);

/** Сообщение о состоянии данных: причина отказа или заметка о пресете. */
interface DataNotice {
  /** Источник сообщения: он же ключ списка. */
  source: "servers" | "run" | "preset";
  text: string;
  /** Отказ прерывает работу и объявляется сразу; заметка — мягко. */
  urgent: boolean;
}

/**
 * Собирает сообщения в один список.
 *
 * Полоса стоит в шапке карточки данных, а не между рядами полей: причина
 * отказа относится к результатам проверки, а не к самим фильтрам.
 */
const notices = computed<DataNotice[]>(() => {
  const list: DataNotice[] = [];
  const serversError = session.status.servers.error;
  const runError = session.status.run.error;

  if (serversError) {
    list.push({
      source: "servers",
      text: t("dnslookup.view.serversError", { reason: serversError }),
      urgent: true,
    });
  }
  if (runError) {
    list.push({ source: "run", text: runError, urgent: true });
  }
  if (presetNote.value) {
    list.push({ source: "preset", text: presetNote.value, urgent: false });
  }

  return list;
});

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
    header: t("dnslookup.view.clearHeader"),
    message: t("dnslookup.view.clearMessage"),
    icon: "pi pi-exclamation-triangle",
    acceptLabel: t("dnslookup.view.clearAccept"),
    rejectLabel: t("dnslookup.view.cancel"),
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
        ? t("dnslookup.view.exportClipboard", { count: result.rows })
        : result.copied
          ? t("dnslookup.view.exportWithCopy", { count: result.rows })
          : t("dnslookup.view.exportDone", { count: result.rows });
  } catch (error) {
    exportNote.value = t("dnslookup.view.exportFailed", {
      reason: String(error),
    });
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
            :aria-label="t('dnslookup.view.inputAria')"
            :disabled="running"
            @keyup.enter="submitRow"
          />
          <Select
            v-model="session.defaultType"
            size="small"
            :options="RECORD_TYPES"
            :aria-label="t('dnslookup.view.typeAria')"
            :disabled="running"
          />
          <Button
            :label="t('dnslookup.view.add')"
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
            :placeholder="t('dnslookup.view.serversPlaceholder')"
            :aria-label="t('dnslookup.view.serversAria')"
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
                  :aria-label="t('dnslookup.view.serversMore', { count: overflowServerCount })"
                >
                  +{{ overflowServerCount }}
                </span>
              </template>
              <template v-else>{{ placeholder }}</template>
            </template>
          </MultiSelect>
          <Button
            v-tooltip.top="t('dnslookup.view.customServers')"
            icon="pi pi-pencil"
            severity="secondary"
            outlined
            size="small"
            :aria-label="t('dnslookup.view.customServers')"
            @click="openServers"
          />
        </InputGroup>

        <Button
          class="dns__run"
          :label="running ? t('dnslookup.view.stop') : t('dnslookup.view.run')"
          :icon="running ? 'pi pi-stop' : 'pi pi-play'"
          :severity="running ? 'contrast' : undefined"
          size="small"
          :disabled="!running && !canRun"
          @click="toggleRun"
        />
      </div>
    </div>

    <div class="dns__filters">
      <InputText
        v-model="session.filters.search"
        class="dns__search"
        size="small"
        :placeholder="t('dnslookup.view.search')"
        :aria-label="t('dnslookup.view.search')"
      />
      <Select
        v-model="session.filters.status"
        :options="statusFilterOptions()"
        option-label="label"
        option-value="value"
        class="dns__status"
        size="small"
        :aria-label="t('dnslookup.view.statusFilter')"
      />
      <label class="dns__check">
        <Checkbox
          v-model="session.filters.diffOnly"
          binary
          :disabled="!canCompare"
        />
        <span>
          {{ t("dnslookup.view.diffOnly") }}
          <template v-if="!canCompare"> ({{ compareHint }})</template>
        </span>
      </label>

      <div class="dns__table-actions">
        <Button
          v-tooltip.top="t('dnslookup.view.columns')"
          icon="pi pi-table"
          severity="secondary"
          text
          rounded
          size="small"
          :aria-label="t('dnslookup.view.columns')"
          :disabled="selectedServers.length === 0"
          @click="toggleColumns"
        />
        <Button
          v-tooltip.top="t('dnslookup.view.export')"
          icon="pi pi-download"
          severity="secondary"
          text
          rounded
          size="small"
          :aria-label="t('dnslookup.view.export')"
          :disabled="visibleRows.length === 0"
          @click="exportCsv"
        />
        <Button
          v-tooltip.top="t('dnslookup.view.clear')"
          icon="pi pi-trash"
          severity="danger"
          text
          rounded
          size="small"
          :aria-label="t('dnslookup.view.clear')"
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
    >
      <template #notice>
        <div v-if="notices.length > 0" class="dns-table__notices">
          <p
            v-for="notice in notices"
            :key="notice.source"
            class="dns-table__notice"
            :role="notice.urgent ? 'alert' : undefined"
            :aria-live="notice.urgent ? undefined : 'polite'"
          >
            <i class="pi pi-exclamation-circle" aria-hidden="true" />
            <span>{{ notice.text }}</span>
          </p>
        </div>
      </template>
    </DnsTable>

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

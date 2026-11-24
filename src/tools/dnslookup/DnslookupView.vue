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
import InputText from "primevue/inputtext";
import Popover from "primevue/popover";
import Select from "primevue/select";
import { computed, onMounted, ref } from "vue";
import type { ToolCellProps } from "@/contracts/tools";
import { t } from "@/core/infra/i18n";
import { anchorOverlay } from "@/ui/primevue/popup/anchoredOverlay";
import ToolScreen from "@/ui/tool/ToolScreen.vue";
import DnsTable from "./components/DnsTable.vue";
import PresetBar from "./components/PresetBar.vue";
import PresetsDialog from "./components/PresetsDialog.vue";
import ServerDialog from "./components/ServerDialog.vue";
import {
  SERVER_LIMIT,
  STANDALONE_CELL_KEY,
  statusFilterOptions,
  SYSTEM_SERVER_ID,
} from "./constants";
import { applyDefaultPreset } from "./presets";
import type { ServerOption } from "./types";
import { useDnslookup } from "./useDnslookup";
import "./styles.css";

const props = defineProps<ToolCellProps>();

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
  runAll,
  runRow,
  cancel,
  changeType,
  removeRow,
  moveRow,
  refreshServers,
} = useDnslookup(props);

const serversOpen = ref(false);
const presetsOpen = ref(false);
const presetNote = ref<string | null>(null);
const serverError = ref<string | null>(null);
const columnMenu = ref<InstanceType<typeof Popover> | null>(null);
const paramsMenu = ref<InstanceType<typeof Popover> | null>(null);
const table = ref<InstanceType<typeof DnsTable> | null>(null);

// Новая вкладка открывается с пресетом по умолчанию. Признак свежести ячейки
// гасится внутри загрузки, поэтому повторный показ вкладки пресет не тронет.
onMounted(() => {
  void applyDefaultPreset(session, props.cellKey ?? STANDALONE_CELL_KEY);
});

/** Подсказка о системных резолверах: адреса приходят от ОС, не из настроек. */
const systemHint = computed<string>(() => {
  if (!session.servers.includes(SYSTEM_SERVER_ID)) return "";
  if (session.status.servers.loading) return t("dnslookup.view.systemLoading");
  if (session.systemAddresses.length === 0) {
    return t("dnslookup.servers.systemMissing");
  }
  return t("dnslookup.view.systemList", {
    list: session.systemAddresses.join(", "),
  });
});

/** Пояснение к заблокированному фильтру расхождений. */
const compareHint = computed(() =>
  hasSystem.value ? t("dnslookup.view.needMoreServer") : t("dnslookup.view.needSystemServer"),
);

/** Предел выбора достигнут: невыбранные серверы в поповере недоступны. */
const atServerLimit = computed(() => session.servers.length >= SERVER_LIMIT);

/** Адрес сервера в списке: у системного показывается первый адрес. */
function serverAddress(server: ServerOption): string {
  if (server.kind !== "system") return server.address ?? "";
  if (session.systemAddresses.length === 0) {
    return t("dnslookup.view.paramsSystemAddress");
  }
  return session.systemAddresses[0] ?? "";
}

/** Сколько ещё адресов у системного сервера. */
function serverMore(server: ServerOption): number {
  return server.kind === "system" ? Math.max(session.systemAddresses.length - 1, 0) : 0;
}

/** Полный адрес для подсказки: системный сервер отдаёт все адреса ОС. */
function serverAddressTitle(server: ServerOption): string {
  if (server.kind !== "system") return server.address ?? "";
  return session.systemAddresses.length > 0
    ? session.systemAddresses.join(", ")
    : t("dnslookup.view.paramsSystemAddress");
}

/** Открывает поповер выбора серверов у шестерёнки. */
function openParams(event: MouseEvent): void {
  paramsMenu.value?.toggle(event);

  const target = event.currentTarget;
  if (target instanceof HTMLElement) anchorOverlay(target, "popover");
}

/** Закрывает поповер выбора серверов. */
function closeParams(): void {
  paramsMenu.value?.hide();
}

/** Пресет заменил вход: заметка о прошлом действии и черновик больше не нужны. */
function onPresetsApplied(): void {
  presetNote.value = null;
  table.value?.closeDraft();
}

/** Включает или выключает сервер; больше предела выбрать нельзя. */
function toggleServer(serverId: string, selected: boolean): void {
  if (selected) {
    if (session.servers.includes(serverId) || atServerLimit.value) return;
    session.servers = [...session.servers, serverId];
    return;
  }

  session.servers = session.servers.filter((id) => id !== serverId);
}

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

/** Запуск и остановка — одно действие: во время проверки кнопка отменяет. */
function toggleRun(): void {
  if (running.value) {
    cancel();
  } else {
    runAll();
  }
}

function openServers(): void {
  paramsMenu.value?.hide();
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
</script>

<template>
  <ToolScreen class="dns">
    <template #preset>
      <PresetBar :session="session" @open="presetsOpen = true" @note="presetNote = $event" />
    </template>

    <div class="tool__filters">
      <InputText
        v-model="session.filters.search"
        class="tool__search"
        size="small"
        :placeholder="t('dnslookup.view.search')"
        :aria-label="t('dnslookup.view.search')"
      />
      <Select
        v-model="session.filters.status"
        :options="statusFilterOptions()"
        option-label="label"
        option-value="value"
        class="tool__filter-select"
        size="small"
        :aria-label="t('common.statusFilter')"
      />
      <label class="dns__check">
        <Checkbox v-model="session.filters.diffOnly" binary :disabled="!canCompare" />
        <span>
          {{ t("dnslookup.view.diffOnly") }}
          <template v-if="!canCompare"> ({{ compareHint }})</template>
        </span>
      </label>

      <div class="tool__table-actions">
        <!-- Плюс в ряду иконочных действий: единственный вход в черновик,
             в том же стиле, что колонки и настройки. -->
        <Button
          v-tooltip.top="t('common.add')"
          class="dns__add-icon"
          icon="pi pi-plus"
          severity="secondary"
          text
          size="small"
          :aria-label="t('common.add')"
          :disabled="running"
          @click="table?.openDraft()"
        />
        <Button
          v-tooltip.top="t('dnslookup.view.columns')"
          icon="pi pi-table"
          severity="secondary"
          text
          size="small"
          :aria-label="t('dnslookup.view.columns')"
          :disabled="selectedServers.length === 0"
          @click="toggleColumns"
        />
        <Button
          class="dns__params__open"
          icon="pi pi-cog"
          :severity="session.servers.length === 0 ? 'danger' : 'secondary'"
          text
          size="small"
          v-tooltip.top="t('dnslookup.view.paramsTitle')"
          :aria-label="t('dnslookup.view.paramsTitle')"
          aria-haspopup="true"
          @click="openParams"
        />
        <Button
          class="dns__run tool__run"
          :label="running ? t('common.stop') : t('dnslookup.view.run')"
          :icon="running ? 'pi pi-stop' : 'pi pi-play'"
          :severity="running ? 'contrast' : undefined"
          size="small"
          :disabled="!running && !canRun"
          @click="toggleRun"
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
      <Popover ref="paramsMenu">
        <div class="dns-params">
          <p class="dns-params__title">{{ t("dnslookup.view.paramsTitle") }}</p>
          <p class="dns-params__count">
            {{
              t("dnslookup.view.paramsCount", {
                count: session.servers.length,
                limit: SERVER_LIMIT,
              })
            }}
          </p>
          <ul class="dns-params__list">
            <li v-for="server in availableServers" :key="server.id">
              <label
                class="dns-params__item"
                :class="{ 'dns-params__item--on': session.servers.includes(server.id) }"
                :for="`dns-server-${server.id}`"
              >
                <Checkbox
                  :input-id="`dns-server-${server.id}`"
                  binary
                  :model-value="session.servers.includes(server.id)"
                  :disabled="!session.servers.includes(server.id) && atServerLimit"
                  @update:model-value="toggleServer(server.id, $event)"
                />
                <span class="dns-params__name" :title="server.label">{{ server.label }}</span>
                <span class="dns-params__sep" aria-hidden="true" />
                <span class="dns-params__address" :title="serverAddressTitle(server)">
                  {{ serverAddress(server) }}
                </span>
                <span v-if="serverMore(server) > 0" class="dns-params__extra">
                  +{{ serverMore(server) }}
                </span>
              </label>
            </li>
          </ul>
          <p v-if="atServerLimit" class="dns-params__limit">
            {{ t("dnslookup.view.paramsLimit", { limit: SERVER_LIMIT }) }}
          </p>
          <div class="dns-params__actions">
            <Button
              :label="t('dnslookup.servers.title')"
              icon="pi pi-pencil"
              severity="secondary"
              text
              size="small"
              @click="openServers"
            />
            <Button :label="t('common.done')" size="small" @click="closeParams" />
          </div>
        </div>
      </Popover>
    </div>

    <DnsTable
      ref="table"
      :rows="visibleRows"
      :total-rows="session.rows.length"
      :servers="columnServers"
      :expansion-servers="selectedServers"
      :cells="session.cells"
      :verdicts="verdicts"
      :highlight-row-id="session.highlightRowId"
      :system-hint="systemHint"
      :busy="running"
      v-model:default-type="session.defaultType"
      :add="addRow"
      reorderable
      @type-changed="changeType"
      @repeat="runRow"
      @delete="removeRow"
      @reorder="moveRow"
    >
      <template #notice>
        <div v-if="notices.length > 0" class="tool-table__notices">
          <p
            v-for="notice in notices"
            :key="notice.source"
            class="tool-table__notice"
            :role="notice.urgent ? 'alert' : undefined"
            :aria-live="notice.urgent ? undefined : 'polite'"
          >
            <i class="pi pi-exclamation-circle" aria-hidden="true" />
            <span>{{ notice.text }}</span>
          </p>
        </div>
      </template>
    </DnsTable>

    <template #overlays>
      <ServerDialog
        v-model:visible="serversOpen"
        :servers="session.customServers"
        :occupied="occupiedAddresses"
        :saving="session.status.serversSave.loading"
        :blocked="session.serversBroken"
        :error="serverError ?? (session.serversBroken ? session.status.servers.error : null)"
        @add="submitServer"
        @remove="deleteServer"
      />

      <PresetsDialog v-model:visible="presetsOpen" :session="session" @applied="onPresetsApplied" />
    </template>
  </ToolScreen>
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

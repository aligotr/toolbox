<script setup lang="ts">
// Таблица Ping: строки - цели, раскрытие - адреса и пакеты.
//
// Компонент отвечает только за показ и раскрытие. Данные приходят готовыми:
// отфильтрованные цели и флаг идущей проверки. Поэтому таблица не решает,
// когда запускать проверку, - это дело `useIcmp`.
//
// Строка цели показывает общий итог по всем адресам. В раскрытии два блока:
// «Адреса» со сводкой по каждому адресу и «Пакеты» с плоским списком.
// Вложенных раскрытий нет: пакеты уже видны целиком.

import Button from "primevue/button";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import { nextTick, onBeforeUnmount, onMounted, onUpdated, ref, watch } from "vue";
import { t } from "@/core/infra/i18n";
import { useRowDrag } from "@/ui/rowDrag";
import { TARGET_COLUMN_MAX_WIDTH, TARGET_COLUMN_MIN_WIDTH } from "../constants";
import { addressStatus, addressCaption, statsOf, targetStats, targetStatus } from "../summary";
import {
  familyText,
  formatLoss,
  formatRtt,
  packetStatusText,
  statusClass,
  statusText,
} from "../cell";
import type { IcmpAddress, IcmpTarget, PacketRecord } from "../types";

const props = defineProps<{
  targets: IcmpTarget[];
  totalTargets: number;
  highlightTargetId: string | null;
  /** Идёт проверка: повтор и удаление недоступны. */
  busy: boolean;
}>();

const emit = defineEmits<{
  repeat: [targetId: string];
  delete: [targetId: string];
  /** Новый порядок целей: индексы приходят после переноса. */
  reorder: [from: number, to: number];
}>();

/** Раскрытые цели: объект по идентификатору - так их ждёт DataTable. */
const expandedRows = ref<Record<string, boolean>>({});
const root = ref<HTMLElement | null>(null);

useRowDrag(root, {
  enabled: () => true,
  grab: ".tool-table__cell",
  count: () => props.targets.length,
  reorder: (from, to) => emit("reorder", from, to),
});

/** Ширина закреплённой колонки цели: от неё стоит отступ второй колонки. */
const targetWidth = ref("0px");
let resizeFrame = 0;

/** Пересчёт ширины закреплённой колонки по шапке таблицы. */
function syncFrozenOffset(): void {
  const header = root.value?.querySelector<HTMLElement>("thead th.p-datatable-frozen-column");
  const width = header ? `${header.getBoundingClientRect().width}px` : "0px";
  if (width !== targetWidth.value) targetWidth.value = width;
}

const resizeObserver = new ResizeObserver(() => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(syncFrozenOffset);
});

onMounted(() => {
  if (root.value) resizeObserver.observe(root.value);
  void nextTick(syncFrozenOffset);
});

// Ширина меняется и без ресайза: новые цели переставляют содержимое.
onUpdated(syncFrozenOffset);

onBeforeUnmount(() => {
  resizeObserver.disconnect();
  cancelAnimationFrame(resizeFrame);
});

/** Строка раскрыта: шеврон развёрнут. */
function isExpanded(targetId: string): boolean {
  return expandedRows.value[targetId] === true;
}

/** Клик по строке раскрывает её, как и шеврон. */
function toggle(targetId: string): void {
  if (isExpanded(targetId)) {
    delete expandedRows.value[targetId];
  } else {
    expandedRows.value[targetId] = true;
  }
}

/** Классы строки: недавний дубликат. */
function rowClass(target: IcmpTarget): string {
  return props.highlightTargetId === target.id ? "icmp-row--highlight" : "";
}

/** Пакет вместе с адресом: раскрытию нужны оба. */
interface PacketRow {
  address: IcmpAddress;
  packet: PacketRecord;
}

/** Пакеты цели в порядке времени, затем адреса и номера. */
function packetRows(target: IcmpTarget): PacketRow[] {
  const rows: PacketRow[] = target.addresses.flatMap((address) =>
    address.packets.map((packet) => ({ address, packet })),
  );
  return rows.sort(
    (left, right) =>
      left.packet.atMs - right.packet.atMs ||
      left.packet.sequence - right.packet.sequence ||
      left.address.ip.localeCompare(right.address.ip),
  );
}

/** Первая причина отказа пакета: без неё статус «Ошибка» ничего не объясняет. */
function packetError(target: IcmpTarget): string | null {
  for (const address of target.addresses) {
    for (const packet of address.packets) {
      if (packet.error !== null) return packet.error;
    }
  }
  return null;
}

/** Время пакета в местном виде. */
function packetTime(packet: PacketRecord): string {
  const date = new Date(packet.atMs);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleTimeString();
}

// Дубликат подсвечивается, но может быть за пределами видимой области.
watch(
  () => props.highlightTargetId,
  (targetId) => {
    if (!targetId) return;
    void nextTick(() => {
      const marker = root.value?.querySelector<HTMLElement>(`[data-target-id="${targetId}"]`);
      marker?.closest("tr")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  },
  // Синхронно: повторная подсветка приходит как сброс и новое значение
  // в одном такте, и обычный watcher увидел бы только итог.
  { flush: "sync" },
);
</script>

<template>
  <div
    ref="root"
    class="icmp-table tool-table"
    :class="{ 'tool-table--empty': targets.length === 0 }"
    :style="{ '--tool-frozen-offset': targetWidth }"
  >
    <slot name="notice" />
    <DataTable
      v-model:expanded-rows="expandedRows"
      :value="targets"
      data-key="id"
      :row-class="rowClass"
      scrollable
      size="small"
    >
      <template #empty>
        <div class="tool-table__empty">
          <i class="pi pi-search" aria-hidden="true" />
          <p v-if="totalTargets === 0">{{ t("icmp.table.emptyAdd") }}</p>
          <p v-else>{{ t("icmp.table.emptyFiltered") }}</p>
        </div>
      </template>

      <Column
        field="input"
        frozen
        align-frozen="left"
        :style="{
          minWidth: TARGET_COLUMN_MIN_WIDTH,
          maxWidth: TARGET_COLUMN_MAX_WIDTH,
          width: '1%',
        }"
      >
        <template #header>
          <span class="tool-table__heading">
            <span>{{ t("icmp.table.target") }}</span>
            <sup v-if="totalTargets > 0" class="tool-table__count">{{ totalTargets }}</sup>
          </span>
        </template>
        <template #body="{ data }">
          <div class="tool-table__cell">
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
                  isExpanded(data.id) ? t('icmp.table.collapse') : t('icmp.table.expand')
                "
                @click="toggle(data.id)"
              />
              <button
                type="button"
                class="tool-table__name icmp-table__target"
                @click="toggle(data.id)"
              >
                {{ data.input }}
              </button>
              <Button
                icon="pi pi-refresh"
                size="small"
                text
                severity="secondary"
                :aria-label="t('icmp.table.repeat')"
                :disabled="busy"
                @click.stop="emit('repeat', data.id)"
              />
              <Button
                icon="pi pi-trash"
                size="small"
                text
                severity="secondary"
                class="tool-table__delete"
                :aria-label="t('icmp.table.delete')"
                :disabled="busy"
                @click.stop="emit('delete', data.id)"
              />
            </div>
            <small
              v-if="data.normalized && data.normalized !== data.input"
              class="tool-table__normalized"
            >
              {{ data.normalized }}
            </small>
          </div>
        </template>
      </Column>

      <Column :header="t('icmp.table.addresses')" style="min-width: 96px">
        <template #body="{ data }">
          <span class="icmp-table__number">{{ data.addresses.length }}</span>
        </template>
      </Column>

      <Column :header="t('icmp.table.sent')" style="min-width: 96px">
        <template #body="{ data }">
          <span class="icmp-table__number">{{ targetStats(data).sent }}</span>
        </template>
      </Column>

      <Column :header="t('icmp.table.received')" style="min-width: 106px">
        <template #body="{ data }">
          <span class="icmp-table__number">{{ targetStats(data).received }}</span>
        </template>
      </Column>

      <Column :header="t('icmp.table.loss')" style="min-width: 88px">
        <template #body="{ data }">
          <span class="icmp-table__number">{{ formatLoss(targetStats(data).loss) }}</span>
        </template>
      </Column>

      <Column :header="t('icmp.table.min')" style="min-width: 88px">
        <template #body="{ data }">
          <span class="icmp-table__number">{{ formatRtt(targetStats(data).min) }}</span>
        </template>
      </Column>

      <Column :header="t('icmp.table.avg')" style="min-width: 88px">
        <template #body="{ data }">
          <span class="icmp-table__number">{{ formatRtt(targetStats(data).avg) }}</span>
        </template>
      </Column>

      <Column :header="t('icmp.table.max')" style="min-width: 88px">
        <template #body="{ data }">
          <span class="icmp-table__number">{{ formatRtt(targetStats(data).max) }}</span>
        </template>
      </Column>

      <Column :header="t('icmp.table.last')" style="min-width: 96px">
        <template #body="{ data }">
          <span class="icmp-table__number">{{ formatRtt(targetStats(data).last) }}</span>
        </template>
      </Column>

      <Column :header="t('icmp.table.status')" style="min-width: 132px">
        <template #body="{ data }">
          <span :class="statusClass(targetStatus(data, busy))">
            {{ statusText(targetStatus(data, busy)) }}
          </span>
        </template>
      </Column>

      <template #expansion="{ data }">
        <div class="icmp-expand">
          <section class="icmp-expand__block">
            <h3 class="icmp-expand__title">{{ t("icmp.table.addressBlock") }}</h3>
            <p v-if="data.error" class="icmp-expand__note" role="alert">{{ data.error }}</p>
            <table v-else-if="data.addresses.length > 0" class="icmp-details">
              <thead>
                <tr>
                  <th scope="col">{{ t("icmp.table.address") }}</th>
                  <th scope="col">{{ t("icmp.table.family") }}</th>
                  <th scope="col">{{ t("icmp.table.sent") }}</th>
                  <th scope="col">{{ t("icmp.table.received") }}</th>
                  <th scope="col">{{ t("icmp.table.loss") }}</th>
                  <th scope="col">{{ t("icmp.table.min") }}</th>
                  <th scope="col">{{ t("icmp.table.avg") }}</th>
                  <th scope="col">{{ t("icmp.table.max") }}</th>
                  <th scope="col">{{ t("icmp.table.last") }}</th>
                  <th scope="col">{{ t("icmp.table.status") }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="address in data.addresses" :key="`${address.ip}%${address.scopeId}`">
                  <td class="icmp-details__mono">{{ addressCaption(address) }}</td>
                  <td>{{ familyText(address.family) }}</td>
                  <td class="icmp-details__number">{{ statsOf(address.packets).sent }}</td>
                  <td class="icmp-details__number">{{ statsOf(address.packets).received }}</td>
                  <td class="icmp-details__number">
                    {{ formatLoss(statsOf(address.packets).loss) }}
                  </td>
                  <td class="icmp-details__number">
                    {{ formatRtt(statsOf(address.packets).min) }}
                  </td>
                  <td class="icmp-details__number">
                    {{ formatRtt(statsOf(address.packets).avg) }}
                  </td>
                  <td class="icmp-details__number">
                    {{ formatRtt(statsOf(address.packets).max) }}
                  </td>
                  <td class="icmp-details__number">
                    {{ formatRtt(statsOf(address.packets).last) }}
                  </td>
                  <td>
                    <span :class="statusClass(addressStatus(address, busy))">
                      {{ statusText(addressStatus(address, busy)) }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-else class="icmp-expand__note">{{ t("icmp.table.addressesPending") }}</p>
          </section>

          <section class="icmp-expand__block">
            <h3 class="icmp-expand__title">{{ t("icmp.table.packetBlock") }}</h3>
            <p v-if="packetError(data)" class="icmp-expand__note" role="alert">
              {{ packetError(data) }}
            </p>
            <p v-if="packetRows(data).length === 0" class="icmp-expand__note">
              {{ t("icmp.table.packetsPending") }}
            </p>
            <table v-else class="icmp-details">
              <thead>
                <tr>
                  <th scope="col">{{ t("icmp.table.address") }}</th>
                  <th scope="col">{{ t("icmp.table.family") }}</th>
                  <th scope="col">{{ t("icmp.table.sequence") }}</th>
                  <th scope="col">{{ t("icmp.table.status") }}</th>
                  <th scope="col">{{ t("icmp.table.rtt") }}</th>
                  <th scope="col">{{ t("icmp.table.ttl") }}</th>
                  <th scope="col">{{ t("icmp.table.time") }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in packetRows(data)"
                  :key="`${row.address.ip}%${row.address.scopeId}-${row.packet.sequence}-${row.packet.atMs}`"
                >
                  <td class="icmp-details__mono">{{ addressCaption(row.address) }}</td>
                  <td>{{ familyText(row.address.family) }}</td>
                  <td class="icmp-details__number">{{ row.packet.sequence }}</td>
                  <td>{{ packetStatusText(row.packet.status) }}</td>
                  <td class="icmp-details__number">{{ formatRtt(row.packet.rttMs) }}</td>
                  <td class="icmp-details__number">{{ row.packet.ttl ?? "-" }}</td>
                  <td class="icmp-details__number">{{ packetTime(row.packet) }}</td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>
      </template>
    </DataTable>
  </div>
</template>

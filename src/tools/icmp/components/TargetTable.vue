<script setup lang="ts">
// Таблица Ping: строки - цели, раскрытие - адреса и пакеты.
//
// Компонент отвечает только за показ и раскрытие. Данные приходят готовыми:
// отфильтрованные цели и флаг идущей проверки. Поэтому таблица не решает,
// когда запускать проверку, - это дело `useIcmp`.
//
// Главная строка отвечает на три вопроса: куда шли пакеты, сколько вернулось
// и как быстро. Мин, среднее, максимум и последний RTT живут в раскрытии:
// в строке они занимали четыре колонки и вытесняли статус за край.
//
// Раскрытие показывает адреса и пакеты подтаблицами: подробности читаются
// сверху вниз, а адрес и семейство стоят в своих колонках. Ширина раскрытия
// равна ширине строки, поэтому таблица прокручивается внутри себя, если
// колонок больше, чем места.

import Button from "primevue/button";
import Column from "primevue/column";
import { t } from "@/core/infra/i18n";
import ToolDetails from "@/ui/tool/ToolDetails.vue";
import ToolDetailsSection from "@/ui/tool/ToolDetailsSection.vue";
import ToolExpansionHead from "@/ui/tool/ToolExpansionHead.vue";
import ToolTable from "@/ui/tool/ToolTable.vue";
import {
  LATENCY_COLUMN_MIN_WIDTH,
  PACKET_COLUMN_MIN_WIDTH,
  STATUS_COLUMN_MIN_WIDTH,
  TARGET_COLUMN_MAX_WIDTH,
  TARGET_COLUMN_MIN_WIDTH,
} from "../constants";
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

/** Классы строки: недавний дубликат. */
function rowClass(target: IcmpTarget): string {
  return props.highlightTargetId === target.id ? "icmp-row--highlight" : "";
}

/** Перенос строки приходит из общей таблицы и уходит экрану как есть. */
function forwardReorder(from: number, to: number): void {
  emit("reorder", from, to);
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
</script>

<template>
  <ToolTable
    class="icmp-table"
    :rows="targets"
    :total="totalTargets"
    :empty-add="t('icmp.table.emptyAdd')"
    :empty-filtered="t('icmp.table.emptyFiltered')"
    :highlight-id="highlightTargetId"
    :row-class="rowClass"
    mark-expanded
    @reorder="forwardReorder"
  >
    <template #notice>
      <slot name="notice" />
    </template>

    <template #default="{ isExpanded, toggle }">
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
                class="tool-table__name tool-table__name--button"
                :data-tool-row="data.id"
                :aria-expanded="isExpanded(data.id)"
                @click="toggle(data.id)"
              >
                <span class="tool-table__name-text">
                  {{ data.input }}
                  <sup
                    v-if="data.addresses.length > 1"
                    class="tool-table__count"
                    :title="t('icmp.table.addressCount', { count: data.addresses.length })"
                    :aria-label="t('icmp.table.addressCount', { count: data.addresses.length })"
                  >
                    {{ data.addresses.length }}
                  </sup>
                </span>
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

      <Column :header="t('icmp.table.packetPair')" :style="{ minWidth: PACKET_COLUMN_MIN_WIDTH }">
        <template #body="{ data }">
          <span class="tool-table__number">
            {{ targetStats(data).sent }}/{{ targetStats(data).received }}
          </span>
        </template>
      </Column>

      <Column :header="t('icmp.table.avgLatency')" :style="{ minWidth: LATENCY_COLUMN_MIN_WIDTH }">
        <template #body="{ data }">
          <span class="tool-table__number">{{ formatRtt(targetStats(data).avg) }}</span>
        </template>
      </Column>

      <Column :header="t('icmp.table.status')" :style="{ minWidth: STATUS_COLUMN_MIN_WIDTH }">
        <template #body="{ data }">
          <span :class="statusClass(targetStatus(data, busy))">
            {{ statusText(targetStatus(data, busy)) }}
          </span>
        </template>
      </Column>
    </template>

    <template #expansion-head="{ data, toggle }">
      <ToolExpansionHead
        :row-name="data.input"
        :collapse-label="t('icmp.table.collapseShort')"
        @collapse="toggle(data.id)"
      >
        <template #name-addon>
          <sup
            v-if="data.addresses.length > 1"
            class="tool-table__count"
            :title="t('icmp.table.addressCount', { count: data.addresses.length })"
            :aria-label="t('icmp.table.addressCount', { count: data.addresses.length })"
          >
            {{ data.addresses.length }}
          </sup>
        </template>
        <span class="tool-table__expansion-status" :class="statusClass(targetStatus(data, busy))">
          {{ statusText(targetStatus(data, busy)) }}
        </span>
      </ToolExpansionHead>
    </template>

    <template #expansion="{ data }">
      <ToolDetails nested>
        <ToolDetailsSection :title="t('icmp.table.addressBlock')">
          <p v-if="data.error" class="tool-details__note" role="alert">{{ data.error }}</p>
          <div v-else-if="data.addresses.length > 0" class="icmp-details-wrap">
            <table class="icmp-details">
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
          </div>
          <p v-else class="tool-details__note">{{ t("icmp.table.addressesPending") }}</p>
        </ToolDetailsSection>

        <ToolDetailsSection :title="t('icmp.table.packetBlock')">
          <p v-if="packetError(data)" class="tool-details__note" role="alert">
            {{ packetError(data) }}
          </p>
          <p v-if="packetRows(data).length === 0" class="tool-details__note">
            {{ t("icmp.table.packetsPending") }}
          </p>
          <div v-else class="icmp-details-wrap">
            <table class="icmp-details">
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
          </div>
        </ToolDetailsSection>
      </ToolDetails>
    </template>
  </ToolTable>
</template>

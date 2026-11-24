<script setup lang="ts">
// Раскрытие строки таблицы DNS.
//
// Показывает все выбранные серверы, включая скрытые колонки: пользователь
// раскрыл строку, чтобы увидеть ответы целиком, и прятать часть из них
// было бы обманом. Записи приходят готовыми: компонент только читает
// ячейку и раскладывает статус, запись и TTL.
//
// Строки выровнены по колонкам, поэтому ответы сравниваются перебором
// сверху вниз: у каждого сервера видны статус, время и все записи. Сервер
// с несколькими записями занимает столько строк, сколько у него ответов,
// а имя и статус тянутся на всю группу.
//
// Контейнер раскрытия - из общего слоя `ToolDetails`; таблица своя, потому
// что колонки у DNS свои.

import { computed } from "vue";
import { t } from "@/core/infra/i18n";
import ToolDetails from "@/ui/tool/ToolDetails.vue";
import { answersOf, elapsedOf, noteFor, statusClass, statusLabel } from "../cell";
import type { CellDetailsEntry, DnsAnswer, DnsCell, ServerOption } from "../types";

const props = defineProps<{
  /** Серверы раскрытия и их результаты; порядок - порядок колонок. */
  entries: CellDetailsEntry[];
}>();

/** Группа строк одного сервера: записи и общие для группы значения. */
interface DetailsGroup {
  server: ServerOption;
  cell: DnsCell | undefined;
  /** Записи сервера или единственная пустая строка с пояснением. */
  answers: (DnsAnswer | null)[];
  /** Сколько строк занимает группа: по числу записей, минимум одна. */
  span: number;
  elapsed: number | null;
}

const groups = computed<DetailsGroup[]>(() =>
  props.entries.map((entry) => {
    const answers = answersOf(entry.cell);
    return {
      server: entry.server,
      cell: entry.cell,
      answers: answers.length > 0 ? answers : [null],
      span: Math.max(answers.length, 1),
      elapsed: elapsedOf(entry.cell),
    };
  }),
);

/** Время ответа одной строкой: у сервера оно одно на все записи. */
function elapsedText(value: number): string {
  return t("dnslookup.cell.elapsed", { value });
}
</script>

<template>
  <ToolDetails nested>
    <div class="dns-details-wrap">
      <table class="dns-details">
        <thead>
          <tr>
            <th scope="col">{{ t("dnslookup.details.server") }}</th>
            <th scope="col">{{ t("common.status") }}</th>
            <th scope="col">{{ t("common.answer") }}</th>
            <th scope="col">{{ t("dnslookup.details.ttl") }}</th>
            <th scope="col">{{ t("dnslookup.details.elapsed") }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="group in groups" :key="group.server.id">
            <tr v-for="(answer, index) in group.answers" :key="`${group.server.id}:${index}`">
              <th v-if="index === 0" scope="row" :rowspan="group.span" class="dns-details__server">
                <span class="dns-details__name">{{ group.server.label }}</span>
                <span class="dns-details__meta">{{ group.server.address ?? "" }}</span>
              </th>
              <td v-if="index === 0" :rowspan="group.span" class="dns-details__status">
                <span class="cell__status" :class="statusClass(group.cell)">
                  {{ statusLabel(group.cell) }}
                </span>
              </td>
              <td class="dns-details__answer">
                <code v-if="answer">{{ answer.value }}</code>
                <span v-else class="dns-details__note">{{ noteFor(group.cell) }}</span>
              </td>
              <td class="dns-details__number">{{ answer?.ttl ?? "-" }}</td>
              <td v-if="index === 0" :rowspan="group.span" class="dns-details__number">
                {{ group.elapsed === null ? "-" : elapsedText(group.elapsed) }}
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </ToolDetails>
</template>

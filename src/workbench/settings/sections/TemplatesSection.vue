<script setup lang="ts">
// Раздел «Шаблоны» в настройках.
//
// Здесь шаблонами управляют: открыть, переименовать, дублировать, удалить.
// Создание живёт в меню вкладки: шаблон — это сохранённая раскладка, и её
// источник всегда конкретная вкладка.
//
// Удаление спрашивает подтверждение и уносит файл в `local/trash/templates/`:
// промах в списке не должен стоить собранной раскладки.

import Button from "primevue/button";
import InputText from "primevue/inputtext";
import { useConfirm } from "primevue/useconfirm";
import { onMounted } from "vue";
import type { Template } from "@/core/services/templates";
import { CONFIRM_CALM_REJECT, CONFIRM_DANGER_ACCEPT } from "@/core/constants";
import { t } from "@/core/infra/i18n";
import {
  deleteTemplate,
  duplicateTemplate,
  loadTemplates,
  renameTemplate,
  status,
  templates,
} from "@/core/services/templates/index";
import { openTemplate } from "@/core/services/workspace/index";
import { TEMPLATE_TITLE_MAX_LENGTH } from "../../constants";
import { toolsLabel } from "../../plural";
import { useRename } from "../useRename";

const confirm = useConfirm();

const {
  renamingId,
  title: renameTitle,
  start: startRename,
  cancel: cancelRename,
  submit: submitRename,
} = useRename<Template>(renameTemplate, status.rename);

/** Сколько инструментов в шаблоне: подпись строки. */
function toolCount(template: Template): number {
  return template.layout.reduce((sum, column) => sum + column.tools.length, 0);
}

function requestDelete(template: Template): void {
  confirm.require({
    header: t("settings.templates.deleteHeader"),
    message: t("settings.templates.deleteMessage", { title: template.title }),
    acceptLabel: t("settings.templates.deleteAccept"),
    rejectLabel: t("settings.templates.deleteReject"),
    acceptProps: CONFIRM_DANGER_ACCEPT,
    rejectProps: CONFIRM_CALM_REJECT,
    accept: () => void deleteTemplate(template),
  });
}

onMounted(() => {
  void loadTemplates();
});
</script>

<template>
  <section class="templates wb-section">
    <div class="wb-section__head">
      <h2 class="wb-section__title">{{ t("settings.section.templates") }}</h2>
      <p class="wb-section__lead">{{ t("settings.templates.lead") }}</p>
    </div>

    <p v-if="status.list.error" class="templates__error">
      {{ t("settings.templates.listError", { reason: status.list.error }) }}
    </p>

    <p v-if="!templates.loaded" class="templates__note">
      {{ t("settings.templates.loading") }}
    </p>
    <p v-else-if="!templates.items.length" class="templates__note">
      {{ t("settings.templates.empty") }}
    </p>

    <ul v-else class="templates__list">
      <li v-for="template in templates.items" :key="template.id" class="template-row">
        <div class="template-row__main">
          <strong class="template-row__name">{{ template.title }}</strong>
          <span class="template-row__meta">
            {{ toolsLabel(toolCount(template)) }}
            <span class="template-row__id mono">{{ template.id }}</span>
          </span>
        </div>

        <form
          v-if="renamingId === template.id"
          class="template-row__form"
          @submit.prevent="submitRename(template)"
        >
          <InputText
            v-model="renameTitle"
            :maxlength="TEMPLATE_TITLE_MAX_LENGTH"
            :aria-label="t('settings.templates.renameAria', { title: template.title })"
          />
          <Button
            type="submit"
            :label="t('settings.templates.save')"
            size="small"
            :loading="status.rename.loading"
            :disabled="!renameTitle.trim()"
          />
          <Button
            type="button"
            :label="t('settings.templates.cancel')"
            size="small"
            severity="secondary"
            text
            @click="cancelRename"
          />
        </form>

        <div v-else class="template-row__actions">
          <Button
            :label="t('settings.templates.open')"
            size="small"
            severity="secondary"
            outlined
            @click="openTemplate(template)"
          />
          <Button
            :label="t('settings.templates.rename')"
            size="small"
            severity="secondary"
            text
            :disabled="status.rename.loading"
            @click="startRename(template)"
          />
          <Button
            :label="t('settings.templates.duplicate')"
            size="small"
            severity="secondary"
            text
            :loading="status.duplicate.loading"
            @click="duplicateTemplate(template.id)"
          />
          <Button
            :label="t('settings.templates.delete')"
            size="small"
            severity="danger"
            text
            :disabled="status.delete.loading"
            @click="requestDelete(template)"
          />
        </div>

        <p
          v-if="renamingId === template.id && status.rename.error"
          class="template-row__error"
        >
          {{ status.rename.error }}
        </p>
      </li>
    </ul>

    <p v-if="status.duplicate.error" class="templates__error">
      {{ status.duplicate.error }}
    </p>
    <p v-if="status.delete.error" class="templates__error">{{ status.delete.error }}</p>
  </section>
</template>

<style scoped>
.templates__list {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}

.template-row {
  display: flex;
  align-items: center;
  gap: var(--ag-space-lg);
  flex-wrap: wrap;
  padding: var(--ag-space-lg);
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-md);
  background: var(--ag-surface);
}

.template-row__main {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-xs);
  min-width: 200px;
  margin-right: auto;
}

.template-row__name {
  font-size: var(--ag-text-md);
}

.template-row__meta {
  display: flex;
  align-items: center;
  gap: var(--ag-space-sm);
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-xs);
}

.template-row__id {
  overflow: hidden;
  max-width: 240px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-row__form,
.template-row__actions {
  display: flex;
  align-items: center;
  gap: var(--ag-space-sm);
  flex-wrap: wrap;
}

.template-row__form :deep(input) {
  min-width: 240px;
}

.template-row__error,
.templates__error {
  flex-basis: 100%;
  margin: 0;
  color: var(--ag-danger);
  font-size: var(--ag-text-xs);
  line-height: 1.45;
}

.templates__note {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-sm);
}

.mono {
  font-family: var(--ag-font-mono);
  font-size: var(--ag-text-xs);
}
</style>

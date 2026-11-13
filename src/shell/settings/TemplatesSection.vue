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
import { onMounted, ref } from "vue";
import type { Template } from "../../contracts/templates";
import {
  deleteTemplate,
  duplicateTemplate,
  loadTemplates,
  renameTemplate,
  status,
  templates,
} from "../../core/templates";
import { openTemplate } from "../../core/workspace";
import { TEMPLATE_TITLE_MAX_LENGTH } from "../constants";
import { toolsLabel } from "../plural";

const confirm = useConfirm();

/** Идентификатор шаблона, который сейчас переименовывают. */
const renamingId = ref<string | null>(null);
const renameTitle = ref("");

/** Сколько инструментов в шаблоне: подпись строки. */
function toolCount(template: Template): number {
  return template.layout.reduce((sum, column) => sum + column.tools.length, 0);
}

function startRename(template: Template): void {
  renamingId.value = template.id;
  renameTitle.value = template.title;
  status.rename.error = null;
}

function cancelRename(): void {
  renamingId.value = null;
  renameTitle.value = "";
  status.rename.error = null;
}

async function submitRename(template: Template): Promise<void> {
  const title = renameTitle.value.trim();
  if (!title) return;

  if (await renameTemplate(template.id, title)) {
    renamingId.value = null;
    renameTitle.value = "";
  }
}

function requestDelete(template: Template): void {
  confirm.require({
    header: "Удаление шаблона",
    message:
      `Шаблон «${template.title}» будет перемещён в local/trash/templates. ` +
      "Файл можно вернуть, пока корзину не почистили.",
    acceptLabel: "Удалить",
    rejectLabel: "Отмена",
    accept: () => void deleteTemplate(template),
  });
}

onMounted(() => {
  void loadTemplates();
});
</script>

<template>
  <section class="templates">
    <header class="templates__head">
      <div>
        <h2 class="templates__title">Шаблоны</h2>
        <p class="templates__lead">
          Шаблон хранит раскладку вкладки: колонки, инструменты и их ширины.
          Введённые значения и результаты не сохраняются.
        </p>
      </div>
    </header>

    <p v-if="status.list.error" class="templates__error">
      Шаблоны не прочитаны: {{ status.list.error }}
    </p>

    <p v-if="!templates.loaded" class="templates__note">Список шаблонов читается…</p>
    <p v-else-if="!templates.items.length" class="templates__note">
      Шаблонов пока нет. Соберите вкладку и выберите «Сохранить как шаблон»
      в меню вкладки.
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
            :aria-label="`Новое название шаблона «${template.title}»`"
          />
          <Button
            type="submit"
            label="Сохранить"
            size="small"
            :loading="status.rename.loading"
            :disabled="!renameTitle.trim()"
          />
          <Button
            type="button"
            label="Отмена"
            size="small"
            severity="secondary"
            text
            @click="cancelRename"
          />
        </form>

        <div v-else class="template-row__actions">
          <Button
            label="Открыть"
            size="small"
            severity="secondary"
            outlined
            @click="openTemplate(template)"
          />
          <Button
            label="Переименовать"
            size="small"
            severity="secondary"
            text
            :disabled="status.rename.loading"
            @click="startRename(template)"
          />
          <Button
            label="Дублировать"
            size="small"
            severity="secondary"
            text
            :loading="status.duplicate.loading"
            @click="duplicateTemplate(template.id)"
          />
          <Button
            label="Удалить"
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
.templates {
  display: flex;
  flex-direction: column;
  gap: var(--ag-space-lg);
}

.templates__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ag-space-lg);
}

.templates__title {
  margin: 0 0 var(--ag-space-sm);
  font-size: var(--ag-text-lg);
  font-weight: 600;
}

.templates__lead {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: var(--ag-text-sm);
  line-height: 1.5;
}

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

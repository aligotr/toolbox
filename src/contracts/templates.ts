// Контракт шаблонов вкладок.
//
// Шаблон — файл `profiles/<id>/templates/<templateId>.json`: идентификатор
// в имени файла, название внутри документа. Геометрия приходит как JSON
// без проверки: формат колонки принадлежит интерфейсу, и Rust его не
// разбирает (ADR 0011). Поэтому тип из ядра честно говорит `unknown`,
// а разбор делает `core/layout.ts`.

import type { TabColumn } from "./workspace";

/** Шаблон, как его отдаёт ядро: геометрия ещё не проверена. */
export interface StoredTemplate {
  /** Идентификатор: имя файла без расширения. */
  id: string;
  /** Название для интерфейса. */
  title: string;
  /** Геометрия: массив колонок, но доверять ему рано. */
  layout: unknown;
}

/** Список шаблонов вместе с замечаниями о непрочитанных файлах. */
export interface StoredTemplateList {
  items: StoredTemplate[];
  /** Причины, по которым часть файлов пропущена. */
  warnings: string[];
}

/** Шаблон после разбора: геометрия проверена. */
export interface Template {
  id: string;
  title: string;
  /** Колонки с инструментами и ширинами. */
  layout: TabColumn[];
}

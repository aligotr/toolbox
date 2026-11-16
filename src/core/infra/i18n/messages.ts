// Русские сообщения интерфейса — встроенный словарь и эталон ключей (ADR 0039).
//
// Сейчас это один файл; по мере перевода фрагменты уходят к владельцам кода,
// а `app/locales.ts` собирает из них каталог. Внешний словарь накладывается
// сверху: непереведённый ключ берётся отсюда.
//
// Ключ — контракт `область.сущность.поле`: формулировку менять можно,
// ключ — нет.

import type { Messages } from "./types.ts"

/** Русский встроенный словарь. */
export const ruMessages: Messages = {
  // ── Центр управления ────────────────────────────────────────────────────
  "settings.view.title": "Настройки",
  "settings.view.lead": "Журнал, окно, профили, шаблоны, данные и сведения о программе.",
  "settings.view.nav": "Разделы настроек",

  "settings.section.log": "Журнал",
  "settings.section.window": "Окно",
  "settings.section.profiles": "Профили",
  "settings.section.templates": "Шаблоны",
  "settings.section.data": "Данные",
  "settings.section.language": "Язык",
  "settings.section.app": "Программа",

  // ── Раздел «Язык» ───────────────────────────────────────────────────────
  "settings.language.title": "Язык",
  "settings.language.lead":
    "Выберите, на каком языке показывать программу. Русский уже есть; другие языки добавляются своим словарём — файл перевода кладётся в папку словарей.",
  "settings.language.current": "Язык интерфейса",
  "settings.language.russian": "Русский",
  "settings.language.builtin": "в программе",
  "settings.language.broken": "не читается",
  "settings.language.complete": "переведён полностью",
  "settings.language.missing": "переведён не полностью",
  "settings.language.lost":
    "Словарь выбранного языка пропал или не читается, поэтому программа показывает русский. Выбор сохранён: верните файл или выберите другой язык.",
  "settings.language.partial": {
    one: "Не хватает одной строки перевода — вместо неё показывается русский текст.",
    few: "Не хватает {count} строк перевода — вместо них показывается русский текст.",
    many: "Не хватает {count} строк перевода — вместо них показывается русский текст.",
    other: "Не хватает {count} строки перевода — вместо них показывается русский текст."
  },
  "settings.language.extra": {
    one: "В словаре {count} лишняя строка — программа её не использует.",
    few: "В словаре {count} лишние строки — программа их не использует.",
    many: "В словаре {count} лишних строк — программа их не использует.",
    other: "В словаре {count} лишней строки — программа их не использует."
  },
  "settings.language.empty": "В папке словарей пока пусто: доступен только русский.",
  "settings.language.problem": "Не удалось прочитать файл {code}: {reason}",
  "settings.language.refresh": "Обновить",
  "settings.language.open_folder": "Открыть папку словарей",
  "settings.language.export": "Сохранить образец",
  "settings.language.exported": "Образец сохранён: {path}",
  "settings.language.note":
    "Программа не меняет файлы: ваши правки и комментарии сохраняются.\nНазвания строк не меняйте - по ним программа находит текст.\nПосле правки нажмите «Обновить».",

  // ── Оболочка ─────────────────────────────────────────────────────────────
  "shell.sidebar.tools": "Инструменты",
  "shell.sidebar.app": "Приложение",
  "shell.sidebar.noTools": "Пока нет инструментов",
  "shell.sidebar.collapse": "Свернуть панель (Ctrl+B)",
  "shell.sidebar.expand": "Развернуть панель (Ctrl+B)",
  "shell.profile.fallback": "Профиль",
  "shell.profile.label": "Профиль: {title}",
  "shell.profile.tooltip": "Профиль: список и управление",
  "shell.profile.manage": "Управление профилями",
  "shell.profile.listError": "Список профилей не прочитан: {reason}",

  // ── Полоса вкладок ───────────────────────────────────────────────────────
  "tab.journal.title": "Журнал",
  "tab.settings.title": "Настройки",
  "tab.empty.title": "Новая вкладка",
  "tabs.strip.label": "Вкладки",
  "tabs.tab.menu": "Действия с вкладкой",
  "tabs.tab.menuTitle": "Действия с вкладкой «{title}»",
  "tabs.tab.close": "Закрыть вкладку",
  "tabs.tab.closeTitle": "Закрыть вкладку «{title}»",
  "tabs.tab.dirtyHint": "Есть правки, которых нет в шаблоне",
  "tabs.tab.updateHint": "Шаблон обновлён — можно применить",
  "tabs.menu.updateTemplate": "Обновить «{title}»",
  "tabs.menu.applyUpdate": "Шаблон обновлён — применить",
  "tabs.menu.saveTemplate": "Сохранить как шаблон",
  "tabs.menu.saveNewTemplate": "Сохранить как новый",
  "tabs.menu.saveEmpty": "В пустой вкладке нечего сохранять",
  "tabs.menu.renameTemplate": "Переименовать шаблон",
  "tabs.menu.detachTemplate": "Открепить",
  "tabs.menu.restart": "Перезапустить вкладку",
  "tabs.restart.header": "Перезапустить вкладку?",
  "tabs.restart.loss": "Несохранённые строки и результаты пропадут.",
  "tabs.restart.keep": "Раскладка и шаблон останутся.",
  "tabs.restart.presetOne": "Загрузится пресет «{title}».",
  "tabs.restart.presets": "Загрузятся пресеты: {titles}.",
  "tabs.restart.accept": "Перезапустить",
  "tabs.restart.reject": "Отмена",
  "tabs.apply.header": "Применить обновление шаблона",
  "tabs.apply.message":
    "Раскладка вкладки «{tab}» изменена. Применение шаблона «{template}» заменит её — локальные правки будут потеряны.",
  "tabs.apply.accept": "Применить",
  "tabs.apply.reject": "Отмена",
  "tabs.close.header": "Закрыть вкладку?",
  "tabs.close.message":
    "Вкладка «{tab}» отличается от шаблона «{template}». Записать изменения в шаблон?",
  "tabs.close.missing":
    "Шаблон вкладки «{tab}» удалён — сохранять изменения некуда. Вкладку можно закрыть без записи.",
  "tabs.close.save": "Сохранить",
  "tabs.close.discard": "Не сохранять",
  "tabs.close.cancel": "Отмена",
  "tabs.title.create": "Сохранить шаблон",
  "tabs.title.createNote":
    "В шаблон попадут только колонки, инструменты и их ширины. Введённые значения и результаты запросов не сохраняются.",
  "tabs.title.createSubmit": "Сохранить",
  "tabs.title.rename": "Переименовать шаблон",
  "tabs.title.renameNote": "Файл шаблона останется на месте: изменится только название.",
  "tabs.title.renameSubmit": "Переименовать",
  "tabs.title.field": "Название",
  "tabs.title.placeholder": "Название шаблона",
  "tabs.title.cancel": "Отмена",

  // ── Пустая вкладка ───────────────────────────────────────────────────────
  "workspace.empty.title": "Начать с шаблона",
  "workspace.empty.lead":
    "Выберите заготовку рабочего места или добавьте инструмент — он откроется в новой вкладке.",
  "workspace.empty.templates": "Шаблоны вкладок",
  "workspace.empty.templatesError": "Шаблоны не прочитаны: {reason}",
  "workspace.empty.templatesNone":
    "Сохранённых шаблонов нет. Соберите вкладку и выберите «Сохранить как шаблон» в её меню.",
  "workspace.empty.tools": "Инструменты",
  "workspace.empty.toolsNone": "Инструменты ещё не зарегистрированы.",
  "workspace.empty.coreOn": "Ядро запущено",
  "workspace.empty.coreOff": "Нет связи с ядром",
  "workspace.grid.unknown": "Инструмент не найден:",

  // ── Журнал ───────────────────────────────────────────────────────────────
  "journal.view.title": "Журнал",
  "journal.view.lead": "Что делала программа: факты, ответы и ошибки.",
  "journal.view.filter": "Фильтр по виду записи",
  "journal.view.clear": "Очистить",
  "journal.view.emptyFiltered": "Нет записей выбранного вида.",
  "journal.view.empty": "Записей пока нет.",
  "journal.filter.info": "Факт",
  "journal.filter.result": "Ответ",
  "journal.filter.error": "Ошибка",
  "journal.kind.info": "факт",
  "journal.kind.result": "ответ",
  "journal.kind.error": "ошибка",

  // ── Количество ───────────────────────────────────────────────────────────
  "count.tools": {
    one: "{count} инструмент",
    few: "{count} инструмента",
    many: "{count} инструментов",
    other: "{count} инструмента",
  },
  "count.templates": {
    one: "{count} шаблон",
    few: "{count} шаблона",
    many: "{count} шаблонов",
    other: "{count} шаблона",
  },
  "count.presets": {
    one: "{count} пресет",
    few: "{count} пресета",
    many: "{count} пресетов",
    other: "{count} пресета",
  },
  "count.files": {
    one: "{count} файл",
    few: "{count} файла",
    many: "{count} файлов",
    other: "{count} файла",
  },

  // ── Журнал настроек ──────────────────────────────────────────────────────
  "settings.log.lead":
    "Файл лога нужен для разбора: почему приложение или функция не сработали. Уровень меняется без перезапуска. Работа инструментов пишется в журнал интерфейса, а не сюда.",
  "settings.log.level": "Уровень записи",
  "settings.log.level.error": "Ошибки",
  "settings.log.level.errorHint": "только то, из-за чего функция не сработала",
  "settings.log.level.warn": "Предупреждения",
  "settings.log.level.warnHint": "ошибки и подозрительные места",
  "settings.log.level.info": "Обычный",
  "settings.log.level.infoHint": "ход запуска и ключевые действия",
  "settings.log.level.debug": "Подробный",
  "settings.log.level.debugHint": "всё, что нужно для разбора поломки",
  "settings.log.currentFile": "Текущий файл",
  "settings.log.notStarted": "Лог не запущен.",
  "settings.log.folder": "Папка логов",
  "settings.log.folderUnknown": "Папка неизвестна.",
  "settings.log.openFolder": "Открыть папку логов",
  "settings.log.prune": "Очистить старые логи",
  "settings.log.pruneOlder": {
    one: "Очистить логи старше {count} дня",
    few: "Очистить логи старше {count} дней",
    many: "Очистить логи старше {count} дней",
    other: "Очистить логи старше {count} дня",
  },
  "settings.log.pruneHeader": "Очистка логов",
  "settings.log.pruneMessage": {
    one: "Файлы лога старше {count} дня будут удалены. Свежие записи останутся: по ним ещё можно разбирать поломки.",
    few: "Файлы лога старше {count} дней будут удалены. Свежие записи останутся: по ним ещё можно разбирать поломки.",
    many: "Файлы лога старше {count} дней будут удалены. Свежие записи останутся: по ним ещё можно разбирать поломки.",
    other: "Файлы лога старше {count} дня будут удалены. Свежие записи останутся: по ним ещё можно разбирать поломки.",
  },
  "settings.log.pruneAccept": "Очистить",
  "settings.log.pruneReject": "Отмена",
  "settings.log.pruned": "Удалено файлов: {count}. Свежие записи на месте.",

  // ── Окно ─────────────────────────────────────────────────────────────────
  "settings.window.lead":
    "Размер и положение запоминаются между запусками. Если окно оказалось за краем экрана, сброс вернёт его в пределы рабочей области монитора.",
  "settings.window.systemPosition": "положение выбирает система",
  "settings.window.maximized": "развёрнуто на весь экран",
  "settings.window.normal": "обычное",
  "settings.window.size": "Текущий размер",
  "settings.window.position": "Положение",
  "settings.window.state": "Состояние",
  "settings.window.reset": "Сбросить размер и положение",
  "settings.window.resetHeader": "Сброс окна",
  "settings.window.resetMessage":
    "Размер и положение окна вернутся к значениям по умолчанию. Содержимое вкладок не изменится.",
  "settings.window.resetAccept": "Сбросить",
  "settings.window.resetReject": "Отмена",

  // ── Программа ────────────────────────────────────────────────────────────
  "settings.app.lead":
    "Сведения о сборке и месте, где лежат настройки, лог и профили. Всё состояние хранится рядом с исполняемым файлом.",
  "settings.app.debug": "отладочная (cargo run / tauri dev)",
  "settings.app.release": "релизная",
  "settings.app.version": "Версия",
  "settings.app.buildMode": "Режим сборки",
  "settings.app.activeProfile": "Активный профиль",
  "settings.app.root": "Папка программы",
  "settings.app.openFolder": "Открыть папку программы",
  "settings.app.loading": "Сведения читаются…",

  // ── Данные ───────────────────────────────────────────────────────────────
  "settings.data.lead":
    "Логи, шаблоны и данные инструментов активного профиля. Удаление данных инструмента переносит папку в корзину: файлы можно вернуть, пока её не почистили.",
  "settings.data.clearHeader": "Удаление данных",
  "settings.data.clearMessage":
    "Данные инструмента «{tool}» будут перемещены в local/trash/data. Папку можно вернуть, пока корзину не почистили.",
  "settings.data.clearAccept": "Удалить",
  "settings.data.clearReject": "Отмена",
  "settings.data.loading": "Размеры читаются…",
  "settings.data.logs": "Логи",
  "settings.data.templates": "Шаблоны",
  "settings.data.tools": "Данные инструментов",
  "settings.data.empty": "Данных нет: пока ни один инструмент не сохранил файлы в профиль.",
  "settings.data.clearTool": "Удалить данные",

  // ── Профили ──────────────────────────────────────────────────────────────
  "settings.profiles.lead":
    "Профиль — отдельная папка с шаблонами и данными инструментов. Переключение перезапускает приложение.",
  "settings.profiles.create": "Создать профиль",
  "settings.profiles.titlePlaceholder": "Название профиля",
  "settings.profiles.titleAria": "Название нового профиля",
  "settings.profiles.submit": "Создать",
  "settings.profiles.cancel": "Отмена",
  "settings.profiles.loading": "Список профилей читается…",
  "settings.profiles.empty":
    "Профилей нет. Создайте первый — приложение работает только внутри профиля.",
  "settings.profiles.active": "активный",
  "settings.profiles.renameAria": "Новое название профиля «{title}»",
  "settings.profiles.save": "Сохранить",
  "settings.profiles.switch": "Переключить",
  "settings.profiles.rename": "Переименовать",
  "settings.profiles.delete": "Удалить",
  "settings.profiles.switchHeader": "Переключение профиля",
  "settings.profiles.switchMessage": "Открыть профиль «{title}»? Приложение перезапустится.",
  "settings.profiles.switchAccept": "Переключить",
  "settings.profiles.switchReject": "Отмена",
  "settings.profiles.deleteHeader": "Удаление профиля",
  "settings.profiles.deleteMessage":
    "Профиль «{title}» будет перемещён в local/trash. Данные можно вернуть, пока корзину не почистили.",
  "settings.profiles.deleteAccept": "Удалить",
  "settings.profiles.deleteReject": "Отмена",

  // ── Шаблоны ──────────────────────────────────────────────────────────────
  "settings.templates.lead":
    "Шаблон хранит раскладку вкладки: колонки, инструменты и их ширины. Введённые значения и результаты не сохраняются.",
  "settings.templates.listError": "Шаблоны не прочитаны: {reason}",
  "settings.templates.loading": "Список шаблонов читается…",
  "settings.templates.empty":
    "Шаблонов пока нет. Соберите вкладку и выберите «Сохранить как шаблон» в меню вкладки.",
  "settings.templates.renameAria": "Новое название шаблона «{title}»",
  "settings.templates.save": "Сохранить",
  "settings.templates.cancel": "Отмена",
  "settings.templates.open": "Открыть",
  "settings.templates.rename": "Переименовать",
  "settings.templates.duplicate": "Дублировать",
  "settings.templates.delete": "Удалить",
  "settings.templates.deleteHeader": "Удаление шаблона",
  "settings.templates.deleteMessage":
    "Шаблон «{title}» будет перемещён в local/trash/templates. Файл можно вернуть, пока корзину не почистили.",
  "settings.templates.deleteAccept": "Удалить",
  "settings.templates.deleteReject": "Отмена",

  // ── Единицы размера ──────────────────────────────────────────────────────
  "units.bytes": "Б",
  "units.kilobytes": "КБ",
  "units.megabytes": "МБ",
  "units.gigabytes": "ГБ",
}

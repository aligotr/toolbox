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

  // ── Умолчания данных ─────────────────────────────────────────────────────
  "profiles.defaultTitle": "Работа",
  "templates.copySuffix": " (копия)",
  "presets.copySuffix": " (копия)",

  // ── Единицы размера ──────────────────────────────────────────────────────
  "units.bytes": "Б",
  "units.kilobytes": "КБ",
  "units.megabytes": "МБ",
  "units.gigabytes": "ГБ",

  // ── Описания инструментов ───────────────────────────────────────────────
  "tools.busprobe.description": "Самопроверка шины и путь сообщения",
  "tools.dnslookup.description": "Проверка и сравнение ответов DNS-серверов",

  // ── Busprobe ─────────────────────────────────────────────────────────────
  "busprobe.view.lead":
    "Самопроверка шины: настоящий запрос core:ping и ответ core:pong.",
  "busprobe.view.badgePing": "идёт запрос",
  "busprobe.view.badgeTrace": "идёт прогон",
  "busprobe.view.badgeTraced": "путь записан",
  "busprobe.view.badgeReplied": "ответ получен",
  "busprobe.view.badgeReady": "готов",
  "busprobe.view.inputAria": "Текст сообщения",
  "busprobe.view.inputPlaceholder": "Текст для echo",
  "busprobe.view.check": "Проверить шину",
  "busprobe.view.showPath": "Показать путь",
  "busprobe.view.replyTitle": "Ответ",
  "busprobe.view.sentAt": "Момент ответа",
  "busprobe.view.roundTrip": "Круговое время",
  "busprobe.view.note":
    "Запрос и ответ — события шины. Интерфейс ждёт ответ только по correlation_id; второй подписчик видит тот же core:pong в журнале.",
  "busprobe.view.subscribeFailed": "Подписка на события не создана: {reason}",
  "busprobe.unit.ms": "мс",
  "busprobe.route.title": "Путь сообщения",
  "busprobe.route.stages": {
    one: "{count} этап",
    few: "{count} этапа",
    many: "{count} этапов",
    other: "{count} этапа",
  },
  "busprobe.route.wait": "ожидание ответа {ms} · диспетчер свободен",
  "busprobe.route.dividerRequest": "сообщение 1 · запрос",
  "busprobe.route.dividerReply": "сообщение 2 · ответ",
  "busprobe.route.outcomeOk": "ответ получен",
  "busprobe.route.outcomeTimeout": "таймаут",
  "busprobe.route.outcomeError": "ошибка",
  "busprobe.actor.ui": "интерфейс",
  "busprobe.actor.bus": "шина",
  "busprobe.actor.dispatcher": "диспетчер",
  "busprobe.actor.module": "модуль",
  "busprobe.actor.bridge": "мост",
  "busprobe.actor.core": "ядро",
  "busprobe.stage.askStart":
    "Интерфейс просит ядро отправить запрос и дождаться ответа. Ядро создаёт correlation_id — по нему потом найдётся ожидающий. С этого момента поток команды спит.",
  "busprobe.stage.routeDecode":
    "Ядро переводит JSON из интерфейса в типизированное сообщение Rust. Ошибка разбора оборвала бы цепочку здесь — до очереди дело бы не дошло.",
  "busprobe.stage.queueEnqueue":
    "Сообщение кладётся в очередь. Дальше его возьмёт отдельный поток-диспетчер: на этом месте путь расходится по времени, и появляется асинхронность.",
  "busprobe.stage.dispatchBegin":
    "Диспетчер достал сообщение. Разница с предыдущим этапом — время, которое оно пролежало в очереди. Это и есть цена асинхронной доставки.",
  "busprobe.stage.handlerInvoke":
    "Диспетчер вызывает подписчиков события. Их может быть несколько; если один упадёт с паникой, остальные всё равно получат сообщение.",
  "busprobe.stage.publishReply":
    "Обработчик публикует ответ — обычное событие с тем же correlation_id. Здесь он публикует его из отдельного потока после задержки, поэтому диспетчер во время ожидания свободен.",
  "busprobe.stage.correlationMatch":
    "Ядро смотрит, ждёт ли кто-то событие с таким идентификатором. На запросе — промах: ждут ответ, а не запрос. Именно поэтому в ask нужен явный reply_topic.",
  "busprobe.stage.sinkEmit":
    "Событие уходит в интерфейс. Здесь цепочка покидает Rust: дальше её видят подписчики Vue и журнал.",
  "busprobe.stage.askReply":
    "Ожидающий проснулся и вернул значение в интерфейс. Поток команды снова работает — с тем же значением, которое принесло событие-ответ.",

  // ── DNSlookup: экран ─────────────────────────────────────────────────────
  "dnslookup.view.placeholderDomain": "Введите домен",
  "dnslookup.view.placeholderPtr": "IP-адрес или reverse-имя",
  "dnslookup.view.inputAria": "Домен или IP-адрес",
  "dnslookup.view.typeAria": "Тип записи по умолчанию",
  "dnslookup.view.add": "Добавить",
  "dnslookup.view.serversPlaceholder": "Выберите серверы",
  "dnslookup.view.serversAria": "DNS-серверы",
  "dnslookup.view.serversMore": "и ещё {count}",
  "dnslookup.view.customServers": "Свои DNS-серверы",
  "dnslookup.view.run": "Проверить",
  "dnslookup.view.stop": "Остановить",
  "dnslookup.view.serversError": "Серверы: {reason}",
  "dnslookup.view.search": "Поиск по домену",
  "dnslookup.view.statusFilter": "Фильтр по статусу",
  "dnslookup.view.diffOnly": "Только расхождения",
  "dnslookup.view.needMoreServer": "нужен ещё сервер",
  "dnslookup.view.needSystemServer": "нужен системный сервер",
  "dnslookup.view.columns": "Отображаемые колонки",
  "dnslookup.view.export": "Экспорт CSV",
  "dnslookup.view.clear": "Очистить",
  "dnslookup.view.clearHeader": "Очистить таблицу",
  "dnslookup.view.clearMessage": "Проверка идёт. Остановить её и очистить таблицу?",
  "dnslookup.view.clearAccept": "Очистить",
  "dnslookup.view.cancel": "Отмена",
  "dnslookup.view.systemLoading": "Системные резолверы: загрузка…",
  "dnslookup.view.systemMissing": "Системные резолверы не найдены",
  "dnslookup.view.systemList": "Системные резолверы: {list}",
  "dnslookup.view.exportClipboard":
    "Скачивание недоступно: CSV скопирован в буфер, строк: {count}",
  "dnslookup.view.exportWithCopy": "Экспортировано строк: {count} (копия в буфере)",
  "dnslookup.view.exportDone": "Экспортировано строк: {count}",
  "dnslookup.view.exportFailed": "Не удалось выгрузить CSV: {reason}",

  // ── DNSlookup: таблица ───────────────────────────────────────────────────
  "dnslookup.table.emptyAdd": "Добавьте домен",
  "dnslookup.table.emptyFiltered": "Нет строк по текущим условиям",
  "dnslookup.table.domains": "Домены",
  "dnslookup.table.type": "Тип",
  "dnslookup.table.typeAria": "Тип записи для {name}",
  "dnslookup.table.expand": "Подробности",
  "dnslookup.table.collapse": "Свернуть подробности",
  "dnslookup.table.repeat": "Повторить строку",
  "dnslookup.table.delete": "Удалить строку",
  "dnslookup.table.cellExtra": "{value} и ещё {count}",
  "dnslookup.table.cellLabel": "{server}: {text}, подробности",

  // ── DNSlookup: ячейка и статусы ──────────────────────────────────────────
  "dnslookup.cell.noData": "нет данных",
  "dnslookup.cell.waiting": "ожидание ответа",
  "dnslookup.cell.cancelled": "проверка остановлена",
  "dnslookup.cell.empty": "записей нет",
  "dnslookup.cell.osAddresses": "адреса ОС",
  "dnslookup.cell.elapsed": "{value} мс",
  "dnslookup.cell.ttl": "TTL {value}",
  "dnslookup.status.pending": "—",
  "dnslookup.status.ok": "OK",
  "dnslookup.status.nodata": "NODATA",
  "dnslookup.status.nxdomain": "NXDOMAIN",
  "dnslookup.status.servfail": "SERVFAIL",
  "dnslookup.status.refused": "REFUSED",
  "dnslookup.status.formerr": "FORMERR",
  "dnslookup.status.notimp": "NOTIMP",
  "dnslookup.status.timeout": "TIMEOUT",
  "dnslookup.status.offline": "НЕТ СЕТИ",
  "dnslookup.status.badResponse": "ОШИБКА ОТВЕТА",
  "dnslookup.status.cancelled": "—",
  "dnslookup.filter.all": "все",
  "dnslookup.filter.error": "есть ошибка",
  "dnslookup.filter.empty": "без ответа",

  // ── DNSlookup: свои серверы ──────────────────────────────────────────────
  "dnslookup.servers.title": "Свои DNS-серверы",
  "dnslookup.servers.added": "Добавленные",
  "dnslookup.servers.empty": "Своих серверов пока нет",
  "dnslookup.servers.removeAria": "Удалить сервер {address}",
  "dnslookup.servers.address": "Адрес",
  "dnslookup.servers.addressAria": "Адрес DNS-сервера",
  "dnslookup.servers.name": "Название (необязательно)",
  "dnslookup.servers.namePlaceholder": "Локальный DNS",
  "dnslookup.servers.nameAria": "Название DNS-сервера",
  "dnslookup.servers.hint":
    "Формат: IPv4, IPv4:порт, [IPv6]:порт. Порт по умолчанию — 53.",
  "dnslookup.servers.blocked":
    "Сохранение запрещено: исправьте или удалите файл своих серверов в профиле.",
  "dnslookup.servers.duplicate": "Адрес уже добавлен",
  "dnslookup.servers.add": "Добавить",
  "dnslookup.servers.cancel": "Отмена",
  "dnslookup.servers.brokenFile":
    "Файл своих серверов повреждён: запись запрещена до исправления или удаления",
  "dnslookup.servers.saveFailed": "Не удалось сохранить свои серверы",
  "dnslookup.servers.saving": "Сохранение уже идёт",
  "dnslookup.servers.systemReadError": "системные резолверы: {reason}",
  "dnslookup.servers.customReadError": "свои серверы: {reason}",
  "dnslookup.servers.defaultLabel": "Системный",

  // ── DNSlookup: пресеты ───────────────────────────────────────────────────
  "dnslookup.preset.buttonEmpty": "Пресеты",
  "dnslookup.preset.changed": "Изменён",
  "dnslookup.preset.revertHint": "Отменить изменения",
  "dnslookup.preset.saveHint": "Сохранить в пресет",
  "dnslookup.preset.makeDefault": "Сделать пресетом по умолчанию",
  "dnslookup.preset.clearDefault": "Снять пресет по умолчанию",
  "dnslookup.preset.badgeDefault": "по умолчанию",
  "dnslookup.preset.unknownSavedAt": "время не указано",
  "dnslookup.preset.defaultError": "Пресет по умолчанию не изменён.",
  "dnslookup.preset.defaultCleared":
    "Пресет по умолчанию снят: новые вкладки открываются пустыми.",
  "dnslookup.preset.defaultSet":
    "Пресет «{title}» будет загружаться в новых вкладках.",
  "dnslookup.preset.loadFailed":
    "Пресет «{title}» не загружен: настройки не разобраны.",
  "dnslookup.preset.loadError": "Пресет «{title}» не загружен: {reason}",
  "dnslookup.preset.loaded": "Загружен пресет «{title}».",
  "dnslookup.preset.loadedWarnings": "Загружен пресет «{title}». {warnings}.",
  "dnslookup.preset.saved": "Пресет «{title}» сохранён.",
  "dnslookup.preset.notSaved": "Пресет не сохранён.",
  "dnslookup.preset.reverted": "Изменения отменены.",
  "dnslookup.preset.revertedRestarted":
    "Изменения отменены. Таблица запросов изменилась: результаты очищены, проверка запущена заново.",
  "dnslookup.preset.revertFailed": "Изменения не отменены: {reason}",
  "dnslookup.preset.notReverted": "Нет открытого пресета: отменять нечего.",
  "dnslookup.preset.snapshotBroken":
    "Настройки открытого пресета не разобраны: откат невозможен.",
  "dnslookup.preset.created": "Сохранён пресет «{title}».",
  "dnslookup.preset.notCreated": "Пресет не сохранён.",
  "dnslookup.preset.renamed": "Пресет переименован: «{title}».",
  "dnslookup.preset.notRenamed": "Пресет не переименован.",
  "dnslookup.preset.copied": "Создана копия «{title}».",
  "dnslookup.preset.notCopied": "Пресет не скопирован.",
  "dnslookup.preset.removed": "Пресет «{title}» перемещён в корзину.",
  "dnslookup.preset.notRemoved": "Пресет не удалён.",
  "dnslookup.preset.loadHeader": "Загрузить пресет",
  "dnslookup.preset.loadAccept": "Загрузить",
  "dnslookup.preset.deleteHeader": "Удалить пресет",
  "dnslookup.preset.deleteAccept": "Удалить",
  "dnslookup.preset.cancel": "Отмена",
  "dnslookup.preset.deleteMessage": "Пресет «{title}» будет перемещён в корзину.",
  "dnslookup.preset.deleteOpenMessage":
    "Пресет «{title}» будет перемещён в корзину, привязка снимется. Текущие настройки останутся в таблице.",
  "dnslookup.preset.replaceMessage":
    "Текущие строки и результаты будут заменены пресетом «{title}».",
  "dnslookup.preset.replaceRunning": "Идущая проверка будет остановлена.",
  "dnslookup.preset.dialogTitle": "Пресеты настроек",
  "dnslookup.preset.currentChanged": "настройки изменены",
  "dnslookup.preset.none": "Пресет не выбран",
  "dnslookup.preset.noneHint":
    "Сохраните текущие настройки отдельным пресетом.",
  "dnslookup.preset.listLoading": "Список пресетов читается…",
  "dnslookup.preset.listEmpty":
    "Пресетов пока нет. Настройте инструмент и сохраните настройки первым пресетом.",
  "dnslookup.preset.newTitle": "Название нового пресета",
  "dnslookup.preset.saveAs": "Сохранить как пресет",
  "dnslookup.preset.close": "Закрыть",
  "dnslookup.preset.renameAria": "Новое название пресета",
  "dnslookup.preset.renameSave": "Сохранить название",
  "dnslookup.preset.renameCancel": "Отменить переименование",
  "dnslookup.preset.loadAria": "Загрузить пресет {title}",
  "dnslookup.preset.loadTip": "Загрузить",
  "dnslookup.preset.loadTipAria": "Загрузить пресет",
  "dnslookup.preset.renameTip": "Переименовать",
  "dnslookup.preset.renameTipAria": "Переименовать пресет",
  "dnslookup.preset.duplicateTip": "Дублировать",
  "dnslookup.preset.duplicateAria": "Дублировать пресет",
  "dnslookup.preset.deleteTip": "Удалить",
  "dnslookup.preset.deleteAria": "Удалить пресет",
  "dnslookup.preset.saveChanges": "Сохранить",
  "dnslookup.preset.warnRows": "пропущено строк: {count}",
  "dnslookup.preset.warnServers": "не найдены серверы: {list}",
  "dnslookup.preset.warnServerLimit": {
    one: "выбран только {count} сервер",
    few: "выбраны только {count} сервера",
    many: "выбраны только {count} серверов",
    other: "выбраны только {count} сервера",
  },
  "dnslookup.preset.warnNoServers":
    "в пресете не было серверов: взят набор по умолчанию",
  "dnslookup.preset.serversUnread":
    "Пресет не загружен: свои серверы не прочитаны ({reason}). Исправьте файл и повторите.",

  // ── DNSlookup: проверка ввода ────────────────────────────────────────────
  "dnslookup.validate.emptyAddress": "Введите домен или IP-адрес",
  "dnslookup.validate.ipPtrOnly": "IP-адрес допустим только для типа PTR",
  "dnslookup.validate.ptrZone":
    "Для типа PTR укажите IP-адрес или имя в зоне in-addr.arpa / ip6.arpa",
  "dnslookup.validate.badName": "Некорректное имя «{name}»",
  "dnslookup.validate.wildcard": "После «*.» нужно имя домена",
  "dnslookup.validate.nameTooLong": "Имя длиннее {limit} символов",
  "dnslookup.validate.emptyLabel": "В имени есть пустая метка",
  "dnslookup.validate.labelTooLong":
    "Метка «{label}» длиннее {limit} символов",
  "dnslookup.validate.badChar":
    "Недопустимый символ в «{label}»: разрешены буквы, цифры, «-» и «_»",
  "dnslookup.validate.serverEmpty": "Введите адрес сервера",
  "dnslookup.validate.badIpv6": "Некорректный IPv6-адрес «{address}»",
  "dnslookup.validate.badPort": "Некорректный порт в адресе «{address}»",
  "dnslookup.validate.badServer": "Некорректный адрес сервера «{address}»",

  // ── DNSlookup: запуск ────────────────────────────────────────────────────
  "dnslookup.run.pickServer": "Выберите хотя бы один сервер",
  "dnslookup.run.unknownServer": "Неизвестный сервер «{id}»",
  "dnslookup.run.tooMany":
    "Слишком много запросов: {total}. Предел — {limit}. Уменьшите число строк или серверов",
  "dnslookup.run.rejected": "Проверка отклонена ядром",
  "dnslookup.run.notStarted": "Проверка не запущена: {reason}",
  "dnslookup.run.stopFailed": "Не удалось остановить проверку: {reason}",

  // ── DNSlookup: CSV ───────────────────────────────────────────────────────
  "dnslookup.csv.domain": "Домен",
  "dnslookup.csv.type": "Тип",
  "dnslookup.csv.match": "Совпадение",
  "dnslookup.csv.differs": "расходится у {count} из {total}",
  "dnslookup.csv.matches": "совпадает у {count} из {total}",
  "dnslookup.csv.saveFailed": "Не удалось сохранить CSV и скопировать его в буфер",

  // ── Ошибки ядра ──────────────────────────────────────────────────────────
  // Код ошибки — контракт с Rust: ядро присылает код и подстановки, а текст
  // живёт здесь. Неизвестный код показывает русский `fallback` из ядра.
  "errors.core.unexpected": "{reason}",
  "errors.profiles.read": "Не удалось прочитать «{path}»: {reason}",
  "errors.profiles.create": "Не удалось создать «{path}»: {reason}",
  "errors.profiles.move": "Не удалось перенести «{path}» в «{target}»: {reason}",
  "errors.profiles.notFound": "Профиль «{id}» не найден",
  "errors.profiles.active":
    "Нельзя удалить активный профиль: сначала переключитесь на другой",
  "errors.profiles.emptyId": "Идентификатор профиля пуст",
  "errors.profiles.invalidId":
    "В идентификаторе профиля допустимы латиница, цифры, «-» и «_»",
  "errors.profiles.emptyTitle": "Название профиля не может быть пустым",
  "errors.profiles.longTitle": "Название профиля длиннее {limit} символов",
  "errors.profiles.serialize": "Профиль не сериализован: {reason}",
  "errors.profiles.broken":
    "Файл профиля «{path}» не разобран: {reason}; умолчания скрыты",
}

// Русские сообщения интерфейса: встроенный словарь и эталон ключей (ADR 0039).
//
// Встроенных языков два: русский и английский. Русский словарь задаёт ключи
// и формы, английский повторяет их (ADR 0057). Внешний словарь накладывается
// сверху: непереведённый ключ берётся отсюда.
//
// Ключ - адрес строки в текущей версии: переименование, слияние и удаление
// выполняются напрямую (ADR 0081).

import type { Messages } from "./types.ts";

/** Русский встроенный словарь. */
export const ruMessages: Messages = {
  // ── Общие системные тексты ──────────────────────────────────────────────
  // Действие без предмета: один текст на все места (ADR 0078).
  "common.add": "Добавить",
  "common.cancel": "Отмена",
  "common.close": "Закрыть",
  "common.delete": "Удалить",
  "common.done": "Готово",
  "common.save": "Сохранить",
  "common.core": "Ядро",
  "common.runNotStarted": "Проверка не запущена: {reason}",
  "common.runStopFailed": "Не удалось остановить проверку: {reason}",
  "common.runRejected": "Проверка отклонена ядром",
  "common.runFailed": "Проверка не выполнена: {reason}",
  "common.runLeaveStopFailed": "Проверка покинутой вкладки не остановлена: {reason}",
  "common.subscribeFailed": "Подписка на события не создана: {reason}",
  "common.subscribed": "Подписка на события активна",
  "common.noAnswer": "Без ответа",
  "common.renameSave": "Сохранить название",
  "common.renameCancel": "Отменить переименование",
  "common.create": "Создать",
  "common.load": "Загрузить",
  "common.rename": "Переименовать",
  "common.stop": "Остановить",
  "common.clear": "Очистить",
  "common.details": "Подробности",
  "common.collapseDetails": "Свернуть подробности",
  "common.collapse": "Свернуть",
  "common.cancelAdd": "Отменить добавление",
  "common.allStatuses": "Все статусы",
  "common.statusFilter": "Фильтр по статусу",
  "common.ok": "OK",
  "common.host": "Домен или IP-адрес",
  "common.hostEmpty": "Введите домен или IP-адрес",
  "common.status": "Статус",
  "common.address": "Адрес",
  "common.error": "Ошибка",
  "common.dash": "-",
  "common.journal": "Журнал",
  "common.settings": "Настройки",
  "common.language": "Язык",
  "common.tools": "Инструменты",
  "common.app": "Приложение",
  "common.newTab": "Новая вкладка",
  "common.answer": "Ответ",

  // ── Общие подписи пресетов ─────────────────────────────────────────────
  "presets.buttonEmpty": "Пресеты",
  "presets.changed": "Изменён",
  "presets.revertHint": "Отменить изменения",
  "presets.saveHint": "Сохранить в пресет",
  "presets.makeDefault": "Сделать пресетом по умолчанию",
  "presets.clearDefault": "Снять пресет по умолчанию",
  "presets.unknownSavedAt": "Время не указано",
  "presets.defaultError": "Пресет по умолчанию не изменён.",
  "presets.defaultMissing": "Пресет по умолчанию «{id}» не найден: вкладка открыта пустой",
  "presets.defaultCleared": "Пресет по умолчанию снят: новые вкладки открываются пустыми.",
  "presets.defaultSet": "Пресет «{title}» будет загружаться в новых вкладках.",
  "presets.loadFailed": "Пресет «{title}» не загружен: настройки не разобраны.",
  "presets.loadError": "Пресет «{title}» не загружен: {reason}",
  "presets.loaded": "Загружен пресет «{title}».",
  "presets.loadedWarnings": "Загружен пресет «{title}». {warnings}.",
  "presets.saved": "Пресет «{title}» сохранён.",
  "presets.reverted": "Изменения отменены.",
  "presets.revertFailed": "Изменения не отменены: {reason}",
  "presets.notReverted": "Нет открытого пресета: отменять нечего.",
  "presets.snapshotBroken": "Настройки открытого пресета не разобраны: откат невозможен.",
  "presets.renamed": "Пресет переименован: «{title}».",
  "presets.notRenamed": "Пресет не переименован.",
  "presets.copied": "Создана копия «{title}».",
  "presets.notCopied": "Пресет не скопирован.",
  "presets.removed": "Пресет «{title}» удалён.",
  "presets.notRemoved": "Пресет не удалён.",
  "presets.startNewFailed": "Не удалось создать пресет: {reason}",
  "presets.deleteMessage": "Удалить пресет «{title}»?",
  "presets.startNewMessage": "Создать пустой пресет?\nТекущие настройки не сохранятся.",
  "presets.dialogTitle": "Пресеты настроек",
  "presets.currentChanged": "Настройки изменены",
  "presets.none": "Пресет не выбран",
  "presets.noneHint": "Сохраните текущие настройки отдельным пресетом.",
  "presets.listLoading": "Список пресетов читается…",
  "presets.listEmpty":
    "Пресетов пока нет. Настройте инструмент и сохраните настройки первым пресетом.",
  "presets.newTitle": "Название нового пресета",
  "presets.saveAs": "Сохранить как пресет",
  "presets.startNew": "Пустой пресет",
  "presets.loadAria": "Загрузить пресет {title}",
  "presets.renameTipAria": "Переименовать пресет",
  "presets.duplicateAria": "Дублировать пресет",
  "presets.deleteAria": "Удалить пресет",
  "presets.notSaved": "Пресет не сохранён.",

  // ── Блокирующий экран ───────────────────────────────────────────────────
  "startup.title": "Программа не может начать работу",
  "startup.lead":
    "ToolBox хранит настройки и журналы рядом с программой, чтобы папку можно было перенести на другой компьютер вместе с данными. Сейчас записать файлы не удалось, поэтому работа остановлена.",
  "startup.folder": "Папка программы",
  "startup.reason": "Причина",
  "startup.hint": "Что сделать:",
  "startup.move": "Перенесите папку с программой в доступное место — например, в «Документы»;",
  "startup.permissions": "Или проверьте права на папку и уберите файлы, которые мешают.",
  "startup.exit": "Выйти",

  // ── Центр управления ────────────────────────────────────────────────────
  "settings.view.nav": "Разделы настроек",

  "settings.section.window": "Окно",
  "settings.section.profiles": "Профили",
  "settings.section.app": "О программе",

  // ── Раздел «Язык» ───────────────────────────────────────────────────────
  "settings.language.lead":
    "Встроенные словари обновляются вместе с программой: сейчас это русский и английский.\nВнешние словари - ваши файлы: программа их не меняет.\nФайл изменений показывает новые и лишние строки.",
  "settings.language.current": "Язык интерфейса",
  "settings.language.russian": "Русский",
  "settings.language.english": "Английский",
  "settings.language.builtin": "Встроенный",
  "settings.language.external": "Внешний",
  "settings.language.broken": "Не читается",
  "settings.language.complete": "Полный",
  "settings.language.addCount": "Добавить: {count}",
  "settings.language.removeCount": "Удалить: {count}",
  "settings.language.updatesHint": "Файл изменений: что добавить в словарь и что из него убрать.",
  "settings.language.lost":
    "Словарь выбранного языка пропал или не читается, поэтому программа показывает русский. Выбор сохранён: верните файл или выберите другой язык.",
  "settings.language.badCode": "Код «{code}» не является тегом языка",
  "settings.language.refresh": "Обновить",
  "settings.language.open_folder": "Открыть папку словарей",
  "settings.language.export": "Выгрузить образец",
  "settings.language.exportFile": "Выгрузить во внешний файл",
  "settings.language.revert": "Вернуть встроенный",
  "settings.language.revertMessage": "Удалить файл словаря «{code}» и вернуться к встроенному?",
  "settings.language.revertAccept": "Вернуть",
  "settings.language.updatesExport": "Выгрузить изменения",

  // ── Уведомления ──────────────────────────────────────────────────────────
  "notifications.languages.exported": "Словарь «{code}» выгружен: {file}",
  "notifications.languages.sampleSaved": "Образец словаря сохранён: {file}",
  "notifications.languages.sampleExists": "Образец уже выгружен: {file}",
  "notifications.languages.refreshed": "Список словарей обновлён",
  "notifications.languages.updatesWritten":
    "Файл изменений: {file}\nДобавить: {added}\nУдалить: {removed}",
  "notifications.languages.updatesActual": "Файл изменений уже актуален",
  "notifications.languages.updatesNone": "Изменений нет, файл изменений убран",

  // ── Оболочка ─────────────────────────────────────────────────────────────
  "shell.sidebar.noTools": "Пока нет инструментов",
  "shell.sidebar.collapse": "Свернуть панель (Ctrl+B)",
  "shell.sidebar.expand": "Развернуть панель (Ctrl+B)",
  "shell.profile.fallback": "Профиль",
  "shell.profile.label": "Профиль: {title}",
  "shell.profile.tooltip": "Профиль: список и управление",
  "shell.profile.manage": "Управление профилями",
  "shell.profile.listError": "Список профилей не прочитан: {reason}",

  // ── Полоса вкладок ───────────────────────────────────────────────────────
  "tabs.strip.label": "Вкладки",
  "tabs.scroll.left": "Прокрутить вкладки влево",
  "tabs.scroll.right": "Прокрутить вкладки вправо",
  "tabs.tab.closeTitle": "Закрыть вкладку «{title}»",

  // ── Пустая вкладка ───────────────────────────────────────────────────────
  "workspace.empty.lead": "Выберите инструмент или раздел приложения.",
  "workspace.empty.toolsNone": "Инструменты ещё не зарегистрированы.",
  "workspace.empty.journalDescription": "История событий",
  "workspace.empty.settingsDescription": "Профили, язык, окно, журнал",
  "workspace.empty.preset": "Пресет по умолчанию: {title}",
  "workspace.empty.coreOn": "Ядро запущено",
  "workspace.empty.coreOff": "Нет связи с ядром",
  "workspace.grid.unknown": "Инструмент не найден:",

  // ── Журнал ───────────────────────────────────────────────────────────────
  "journal.view.search": "Поиск по журналу",
  "journal.view.onlyErrors": "Только ошибки",
  "journal.view.allSources": "Все источники",
  "journal.view.sourceFilter": "Фильтр по источнику",
  "journal.view.sourceOption": "{source} ({count})",
  "journal.view.shown": "Показано {shown} из {total}",
  "journal.view.limit": {
    one: "Хранится последняя {count} запись",
    few: "Хранятся последние {count} записи",
    many: "Хранятся последние {count} записей",
    other: "Хранятся последние {count} записей",
  },
  "journal.view.pending": {
    one: "Новая запись: {count}",
    few: "Новые записи: {count}",
    many: "Новых записей: {count}",
    other: "Новых записей: {count}",
  },
  "journal.view.resume": "Продолжить",
  "journal.view.emptyFiltered": "Ничего не найдено. Измените фильтр или запрос.",
  "journal.view.empty": "Пока записей нет. Сюда попадут проверки, сохранения и ошибки.",
  "journal.order.newestFirst": "Сначала новые",
  "journal.order.oldestFirst": "Сначала старые",
  "journal.order.toNewest": "Показать сначала новые",
  "journal.order.toOldest": "Показать сначала старые",
  "journal.day.today": "Сегодня",
  "journal.day.yesterday": "Вчера",
  "journal.clear.message": "Очистить записи?",
  // Записи журнала: формулировку можно менять, код — нет.
  "journal.settings.readError": "Настройки не прочитаны: {reason}",
  "journal.settings.saveError": "Настройки не сохранены (раздел «{section}»): {reason}",
  "journal.settings.logLevel": "Уровень лога: {level}",
  "journal.settings.language": "Язык интерфейса: {language}",
  "journal.settings.windowReset": "Размер и положение окна сброшены",
  "journal.settings.windowResetError": "Геометрия окна не сброшена: {reason}",
  "journal.settings.windowMoved": "Положение окна задано: {x}, {y}",
  "journal.settings.windowMoveError": "Положение окна не изменено: {reason}",
  "journal.settings.windowResized": "Размер окна задан: {width} × {height}",
  "journal.settings.windowResizeError": "Размер окна не изменён: {reason}",

  "journal.profiles.defaultNamed": "Профиль «{id}» назван «{title}»",
  "journal.profiles.defaultNameError": "Профиль по умолчанию не назван: {reason}",
  "journal.profiles.readError": "Профили не прочитаны: {reason}",
  "journal.profiles.usageError": "Счётчики профилей не прочитаны: {reason}",
  "journal.profiles.created": "Создан профиль «{title}» ({id})",
  "journal.profiles.createError": "Профиль не создан: {reason}",
  "journal.profiles.renamed": "Профиль «{id}» переименован в «{title}»",
  "journal.profiles.renameError": "Профиль не переименован: {reason}",
  "journal.profiles.moved": "Профиль «{title}» удалён",
  "journal.profiles.deleteError": "Профиль не удалён: {reason}",
  "journal.profiles.switching": "Переключение на профиль «{title}», перезапуск приложения",
  "journal.profiles.switchError": "Профиль не переключён: {reason}",

  "journal.presets.broken": "Пресет «{tool}» не прочитан: {reason}",
  "journal.presets.defaultBroken": "Указатель пресета по умолчанию «{tool}» не прочитан: {reason}",
  "journal.presets.readError": "Пресеты «{tool}» не прочитаны: {reason}",
  "journal.presets.created": "Сохранён пресет «{title}» ({id}) инструмента «{tool}»",
  "journal.presets.createError": "Пресет не сохранён: {reason}",
  "journal.presets.updated": "Пресет «{title}» обновлён",
  "journal.presets.updateError": "Пресет не обновлён: {reason}",
  "journal.presets.renamed": "Пресет «{id}» переименован в «{title}»",
  "journal.presets.renameError": "Пресет не переименован: {reason}",
  "journal.presets.duplicated": "Пресет «{id}» скопирован как «{title}»",
  "journal.presets.duplicateError": "Пресет не скопирован: {reason}",
  "journal.presets.deleteError": "Пресет не удалён: {reason}",
  "journal.presets.defaultCleared": "Пресет по умолчанию для «{tool}» снят",
  "journal.presets.defaultSet": "Пресет «{title}» выбран по умолчанию для «{tool}»",
  "journal.presets.defaultError": "Пресет по умолчанию не изменён: {reason}",

  "journal.workspace.notObject":
    "Рабочее пространство не восстановлено: ожидался объект JSON; открыта пустая вкладка",
  "journal.workspace.version":
    "Рабочее пространство не восстановлено: версия {version}, ожидалась {expected}; открыта пустая вкладка",
  "journal.workspace.noTabs":
    "Рабочее пространство не восстановлено: список вкладок отсутствует; открыта пустая вкладка",
  "journal.workspace.readError":
    "Рабочее пространство не прочитано: {reason}; открыта пустая вкладка",
  "journal.workspace.saveError": "Рабочее пространство не сохранено: {reason}",
  "journal.workspace.closeSaveError": "Рабочее пространство не сохранено при закрытии: {reason}",
  "journal.workspace.closeHandlerError": "Обработчик закрытия окна не установлен: {reason}",

  "journal.app.busError": "Ошибка шины: {reason}",
  "journal.app.infoError": "Сведения о программе не прочитаны: {reason}",
  "journal.app.folderError": "Папка не открыта: {reason}",

  "journal.logs.pruned": "Удалено старых файлов лога: {count}",
  "journal.logs.pruneError": "Старые логи не удалены: {reason}",

  "journal.languages.readError": "Словари не прочитаны: {reason}",
  "journal.languages.unavailable": "Словарь «{code}» недоступен: интерфейс показывает русский",
  "journal.languages.exportError": "Словарь не выгружен: {reason}",
  "journal.languages.revertError": "Внешний словарь не возвращён: {reason}",
  "journal.languages.updatesError": "Изменения словаря не выгружены: {reason}",
  "journal.languages.updatesFound":
    "При запуске обновлён файл изменений словаря «{code}»: добавить {added}, удалить {removed}",

  "journal.busprobe.pong": "Ответ получен: echo=«{echo}», correlation={correlation}",
  "journal.busprobe.pingError": "Запрос не выполнен: {reason}",
  "journal.busprobe.traceStarted": "Учебный прогон: core:ping с задержкой {delay} мс",
  "journal.busprobe.pongObserver": "Второй подписчик получил core:pong: at={at}",
  "journal.busprobe.traceRecorded": "Цепочка записана: этапов — {stages}, время — {elapsed} мс",
  "journal.busprobe.traceFailed": "Прогон не завершился: {outcome}",

  "journal.dnslookup.finished": "Проверка завершена: {completed} из {total} за {elapsed} мс",
  "journal.dnslookup.started": "Проверка запущена: запросов — {total}, серверов — {servers}",
  "journal.dnslookup.stopped": "Проверка остановлена: получено {completed} из {total}",
  "journal.dnslookup.systemServersFailed": "Системные резолверы не прочитаны: {reason}",
  "journal.dnslookup.serversSaveFailed": "Свои серверы не сохранены: {reason}",
  "journal.dnslookup.serversNotSaved": "Свои серверы не сохранены, причина неизвестна",
  "journal.dnslookup.serverAdded": "Свой сервер добавлен: {address}",
  "journal.dnslookup.serverRemoved": "Свой сервер удалён",
  "journal.dnslookup.presetLoaded":
    "Пресет «{title}» загружен: строк — {rows}, серверов — {servers}",
  "journal.dnslookup.revertedRestarted": "Изменения отменены: строк — {rows}, серверов — {servers}",

  "journal.icmp.started": "Проверка Ping запущена: целей - {targets}, пакетов на адрес - {count}",
  "journal.icmp.startedEndless": "Проверка Ping запущена без ограничения: целей - {targets}",
  "journal.icmp.finished":
    "Проверка Ping завершена: целей - {targets}, адресов - {addresses}, отправлено - {sent}, получено - {received}, время - {elapsed} мс",
  "journal.icmp.cancelled":
    "Проверка Ping остановлена: целей - {targets}, отправлено - {sent}, получено - {received}",
  "journal.icmp.stopped": "Проверка Ping остановлена: отправлено - {sent}, получено - {received}",
  "journal.icmp.presetLoaded": "Пресет Ping «{title}» загружен: целей - {targets}",
  "journal.icmp.revertedCleared": "Изменения отменены, результаты очищены: целей - {targets}",

  // ── Количество ───────────────────────────────────────────────────────────
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
    "В файл лога попадают только отказы: почему приложение или его функция не сработали.\nРабота инструментов идёт в журнал приложения - раздел «Журнал».",
  "settings.log.level": "Уровень записи",
  "settings.log.level.error": "Ошибки",
  "settings.log.level.errorHint": "Только то, из-за чего функция не сработала",
  "settings.log.level.warn": "Предупреждения",
  "settings.log.level.warnHint": "Ошибки и подозрительные места",
  "settings.log.level.info": "Обычный",
  "settings.log.level.infoHint": "Ход запуска и ключевые действия",
  "settings.log.level.debug": "Подробный",
  "settings.log.level.debugHint": "Всё, что нужно для разбора поломки",
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
  "settings.log.pruneMessage": {
    one: "Удалить файлы лога старше {count} дня?",
    few: "Удалить файлы лога старше {count} дней?",
    many: "Удалить файлы лога старше {count} дней?",
    other: "Удалить файлы лога старше {count} дня?",
  },
  "settings.log.pruned": "Удалено файлов: {count}. Свежие записи на месте.",

  // ── Окно ─────────────────────────────────────────────────────────────────
  "settings.window.lead":
    "Размер и положение запоминаются между запусками.\nЕсли окно оказалось за краем экрана, сброс вернёт его в пределы рабочей области монитора.",
  "settings.window.size": "Размер",
  "settings.window.width": "Ширина",
  "settings.window.height": "Высота",
  "settings.window.widthLabel": "Ширина окна",
  "settings.window.heightLabel": "Высота окна",
  "settings.window.position": "Положение",
  "settings.window.positionX": "X",
  "settings.window.positionY": "Y",
  "settings.window.positionXLabel": "Координата X",
  "settings.window.positionYLabel": "Координата Y",
  "settings.window.positionAuto": "Система",
  "settings.window.positionApply": "Применить",
  "settings.window.positionInvalid": "Введите целое число",
  "settings.window.positionRange": "Число вне допустимых пределов",
  "settings.window.reset": "Сбросить размер и положение",
  "settings.window.resetMessage":
    "Размер и положение окна вернутся к значениям по умолчанию.\nСбросить?",
  "settings.window.resetAccept": "Сбросить",

  // ── Программа ────────────────────────────────────────────────────────────
  "settings.app.leadBefore": "Платформа для IT-утилит мистера",
  "settings.app.debug": "Отладочная (cargo run / tauri dev)",
  "settings.app.release": "Релизная",
  "settings.app.version": "Версия",
  "settings.app.buildMode": "Режим сборки",
  "settings.app.openFolder": "Открыть папку программы",
  "settings.app.loading": "Сведения читаются…",

  // ── Профили ──────────────────────────────────────────────────────────────
  "settings.profiles.lead":
    "Профиль - отдельная папка с настройками и данными инструментов.\nПереключение перезапускает приложение.",
  "settings.profiles.create": "Создать профиль",
  "settings.profiles.openFolder": "Открыть папку профилей",
  "settings.profiles.titlePlaceholder": "Название профиля",
  "settings.profiles.titleAria": "Название нового профиля",
  "settings.profiles.loading": "Список профилей читается…",
  "settings.profiles.empty":
    "Профилей нет. Создайте первый — приложение работает только внутри профиля.",
  "settings.profiles.renameAria": "Новое название профиля «{title}»",
  "settings.profiles.unnamed": "Название не прочитано",
  "settings.profiles.unnamedHint":
    "Файл profile.json отсутствует или повреждён: показано имя папки",
  "settings.profiles.switchHeader": "Переключение профиля",
  "settings.profiles.switchMessage": "Открыть профиль «{title}»? Приложение перезапустится.",
  "settings.profiles.switchAccept": "Переключить",
  "settings.profiles.deleteMessage": "Удалить профиль «{title}»?",

  // ── Умолчания данных ─────────────────────────────────────────────────────
  "profiles.defaultTitle": "Работа",
  "presets.copySuffix": " (копия)",

  // ── Открытие инструментов ────────────────────────────────────────────────
  "tools.open.anotherTab": "Ctrl+клик — ещё одна вкладка",

  // ── Описания инструментов ───────────────────────────────────────────────
  "tools.busprobe.description": "Демонстрация шины и путь сообщения",
  // В «DNS‑серверов» неразрывный дефис (U+2011): термин переносится целиком.
  "tools.dnslookup.description": "Проверка и сравнение ответов DNS‑серверов",
  "tools.icmp.description": "Проверка отклика узлов по ICMP",

  // ── Busprobe ─────────────────────────────────────────────────────────────
  "busprobe.view.lead":
    "Демонстрация шины: учебный запрос core:ping и его путь до ответа core:pong.",
  "busprobe.view.inputAria": "Текст сообщения",
  "busprobe.view.inputPlaceholder": "Текст для echo",
  "busprobe.view.check": "Проверить шину",
  "busprobe.view.sentAt": "Момент ответа",
  "busprobe.view.roundTrip": "Круговое время",
  "busprobe.view.note":
    "Запрос и ответ — события шины. Интерфейс ждёт ответ только по correlation_id; второй подписчик видит тот же core:pong в журнале.",
  "busprobe.unit.ms": "мс",
  "busprobe.route.title": "Путь сообщения",
  "busprobe.route.stages": {
    one: "{count} этап",
    few: "{count} этапа",
    many: "{count} этапов",
    other: "{count} этапа",
  },
  "busprobe.route.wait": "Ожидание ответа {ms} · диспетчер свободен",
  "busprobe.route.dividerRequest": "Сообщение 1 · запрос",
  "busprobe.route.dividerReply": "Сообщение 2 · ответ",
  "busprobe.route.outcomeOk": "Ответ получен",
  "busprobe.route.outcomeTimeout": "Таймаут",
  "busprobe.actor.ui": "Интерфейс",
  "busprobe.actor.bus": "Шина",
  "busprobe.actor.dispatcher": "Диспетчер",
  "busprobe.actor.module": "Модуль",
  "busprobe.actor.bridge": "Мост",
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
  "dnslookup.view.typeAria": "Тип записи по умолчанию",
  "dnslookup.view.paramsTitle": "Серверы проверки",
  "dnslookup.view.paramsCount": "Выбрано {count} из {limit}",
  "dnslookup.view.paramsLimit": "Больше {limit} серверов выбрать нельзя",
  "dnslookup.view.paramsSystemAddress": "Адреса из системы",
  "dnslookup.view.run": "Проверить",
  "dnslookup.view.serversError": "Серверы: {reason}",
  "dnslookup.view.search": "Поиск по домену",
  "dnslookup.view.diffOnly": "Только расхождения",
  "dnslookup.view.needMoreServer": "Нужен ещё сервер",
  "dnslookup.view.needSystemServer": "Нужен системный сервер",
  "dnslookup.view.columns": "Отображаемые колонки",
  "dnslookup.view.systemLoading": "Системные резолверы: загрузка…",
  "dnslookup.view.systemStatus": "Системные резолверы: {value}",

  // ── DNSlookup: таблица ───────────────────────────────────────────────────
  "dnslookup.table.emptyAdd": "Добавьте домен",
  "dnslookup.table.emptyFiltered": "Нет строк по текущим условиям",
  "dnslookup.table.domains": "Домены",
  "dnslookup.table.type": "Тип",
  "dnslookup.table.typeAria": "Тип записи для {name}",
  "dnslookup.table.repeat": "Повторить строку",
  "dnslookup.table.delete": "Удалить строку",
  "dnslookup.table.cellExtra": "{value} и ещё {count}",
  "dnslookup.table.cellLabel": "{server}: {text}, подробности",
  "dnslookup.details.server": "Сервер",
  "dnslookup.details.ttl": "TTL, с",
  "dnslookup.details.elapsed": "Время ответа",

  // ── DNSlookup: вердикт строки ─────────────────────────────────────────────
  // Одна подпись на шапку раскрытия.
  "dnslookup.verdict.differs": "Записи расходятся",

  // ── DNSlookup: ячейка и статусы ──────────────────────────────────────────
  "dnslookup.cell.noData": "Нет данных",
  "dnslookup.cell.waiting": "Ожидание ответа",
  "dnslookup.cell.cancelled": "Проверка остановлена",
  "dnslookup.cell.empty": "Записей нет",
  "dnslookup.cell.elapsed": "{value} мс",
  "dnslookup.status.nodata": "NODATA",
  "dnslookup.status.nxdomain": "NXDOMAIN",
  "dnslookup.status.servfail": "SERVFAIL",
  "dnslookup.status.refused": "REFUSED",
  "dnslookup.status.formerr": "FORMERR",
  "dnslookup.status.notimp": "NOTIMP",
  "dnslookup.status.timeout": "TIMEOUT",
  "dnslookup.status.offline": "НЕТ СЕТИ",
  "dnslookup.status.badResponse": "ОШИБКА ОТВЕТА",
  "dnslookup.filter.error": "Есть ошибка",
  // ── DNSlookup: свои серверы ──────────────────────────────────────────────
  "dnslookup.servers.title": "Свои DNS-серверы",
  "dnslookup.servers.added": "Добавленные",
  "dnslookup.servers.empty": "Своих серверов пока нет",
  "dnslookup.servers.removeAria": "Удалить сервер {address}",
  "dnslookup.servers.addressAria": "Адрес DNS-сервера",
  "dnslookup.servers.name": "Название (необязательно)",
  "dnslookup.servers.namePlaceholder": "Локальный DNS",
  "dnslookup.servers.nameAria": "Название DNS-сервера",
  "dnslookup.servers.hint": "Формат: IPv4, IPv4:порт, [IPv6]:порт. Порт по умолчанию — 53.",
  "dnslookup.servers.blocked":
    "Сохранение запрещено: исправьте или удалите файл своих серверов в профиле.",
  "dnslookup.servers.duplicate": "Адрес уже добавлен",
  "dnslookup.servers.brokenFile":
    "Файл своих серверов повреждён: запись запрещена до исправления или удаления",
  "dnslookup.servers.saveFailed": "Не удалось сохранить свои серверы",
  "dnslookup.servers.saving": "Сохранение уже идёт",
  "dnslookup.servers.customReadError": "Свои серверы: {reason}",
  "dnslookup.servers.defaultLabel": "Системный",
  "dnslookup.servers.systemMissing": "Системные резолверы не найдены",

  // ── DNSlookup: пресеты ───────────────────────────────────────────────────
  "dnslookup.preset.revertedRestarted":
    "Изменения отменены. Таблица запросов изменилась: результаты очищены, проверка запущена заново.",
  "dnslookup.preset.replaceMessage":
    "Текущие строки и результаты будут заменены пресетом «{title}».",
  "dnslookup.preset.replaceRunningMessage":
    "Текущие строки и результаты будут заменены пресетом «{title}». Идущая проверка будет остановлена.",
  "dnslookup.preset.warnRows": "Пропущено строк: {count}",
  "dnslookup.preset.warnServers": "Не найдены серверы: {list}",
  "dnslookup.preset.warnServerLimit": {
    one: "Выбран только {count} сервер",
    few: "Выбраны только {count} сервера",
    many: "Выбраны только {count} серверов",
    other: "Выбраны только {count} сервера",
  },
  "dnslookup.preset.warnNoServers": "В пресете не было серверов: взят набор по умолчанию",
  "dnslookup.preset.serversUnread":
    "Пресет не загружен: свои серверы не прочитаны ({reason}). Исправьте файл и повторите.",

  // ── DNSlookup: проверка ввода ────────────────────────────────────────────
  "dnslookup.validate.ipPtrOnly": "IP-адрес допустим только для типа PTR",
  "dnslookup.validate.ptrZone":
    "Для типа PTR укажите IP-адрес или имя в зоне in-addr.arpa / ip6.arpa",
  "dnslookup.validate.badName": "Некорректное имя «{name}»",
  "dnslookup.validate.nameTooLong": "Имя длиннее {limit} символов",
  "dnslookup.validate.emptyLabel": "В имени есть пустая метка",
  "dnslookup.validate.labelTooLong": "Метка «{label}» длиннее {limit} символов",
  "dnslookup.validate.badChar":
    "Недопустимый символ в «{label}»: разрешены буквы, цифры, «-» и «_»",
  "dnslookup.validate.serverEmpty": "Введите адрес сервера",
  "dnslookup.validate.badIpv6": "Некорректный IPv6-адрес «{address}»",
  "dnslookup.validate.badPort": "Некорректный порт в адресе «{address}»",
  "dnslookup.validate.badServer": "Некорректный адрес сервера «{address}»",

  // ── DNSlookup: запуск ────────────────────────────────────────────────────
  "dnslookup.run.pickServer": "Выберите хотя бы один сервер",
  "dnslookup.run.unknownServer": "Неизвестный сервер «{id}»",
  "dnslookup.run.duplicateServer": "Сервер {address} указан дважды",
  "dnslookup.run.tooMany":
    "Слишком много запросов: {total}. Предел — {limit}. Уменьшите число строк или серверов",

  // ── Ping: экран ──────────────────────────────────────────────────────────
  "icmp.view.targetAria": "Домен или IP-адрес цели",
  "icmp.view.familyAria": "Семейство адресов для новой цели",
  "icmp.view.periodMs": "Период, мс",
  "icmp.view.count": "Число проверок, пакетов",
  "icmp.view.endless": "Бесконечно",
  "icmp.view.infinity": "∞",
  "icmp.view.timeoutMs": "Таймаут, мс",
  "icmp.view.paramsTitle": "Параметры проверки",
  "icmp.view.runCount": "Проверить, {count} пак.",
  "icmp.view.search": "Поиск по цели",
  "icmp.view.familyFilter": "Фильтр по семейству",
  "icmp.view.progress":
    "Целей: {targets}, адресов: {addresses}, отправлено: {sent}, получено: {received}",

  // ── Ping: таблица ────────────────────────────────────────────────────────
  "icmp.table.emptyAdd": "Добавьте домен или IP-адрес",
  "icmp.table.emptyFiltered": "Нет целей по текущим условиям",
  "icmp.table.target": "Цель",
  "icmp.table.addressCount": "Найдено адресов: {count}",
  "icmp.table.repeat": "Повторить цель",
  "icmp.table.delete": "Удалить цель",
  "icmp.table.sent": "Отправлено",
  "icmp.table.received": "Получено",
  "icmp.table.loss": "Потери",
  "icmp.table.min": "Мин",
  "icmp.table.avg": "Средн",
  "icmp.table.max": "Макс",
  "icmp.table.last": "Последний",
  "icmp.table.addressBlock": "Адреса",
  "icmp.table.packetBlock": "Пакеты",
  "icmp.table.packetPair": "Пакеты, отпр./получ.",
  "icmp.table.family": "Семейство",
  "icmp.table.addressesPending": "Адреса ещё не получены",
  "icmp.table.packetsPending": "Пакетов пока нет",
  "icmp.table.sequence": "Номер",
  "icmp.table.rtt": "Задержка",
  "icmp.table.avgLatency": "Средняя задержка, мс",
  "icmp.table.ttl": "TTL",
  "icmp.table.time": "Время",

  // ── Ping: статусы и семейства ────────────────────────────────────────────
  "icmp.status.pending": "Ожидание",
  "icmp.status.timeout": "Нет ответа",
  "icmp.status.unreachable": "Недоступен",
  "icmp.status.unresolved": "Не разрешён",
  "icmp.status.cancelled": "Остановлено",
  "icmp.family.auto": "Авто",
  "icmp.family.ipv4": "IPv4",
  "icmp.family.ipv6": "IPv6",
  "icmp.filter.ok": "Все ответили",
  "icmp.filter.loss": "Есть потери",
  "icmp.filter.familyAll": "Все семейства",

  // ── Ping: запуск ─────────────────────────────────────────────────────────
  "icmp.run.noTargets": "Добавьте хотя бы одну цель",
  "icmp.run.period": "Период вне пределов {min}..{max} мс",
  "icmp.run.count": "Число проверок: от {min} до {max}",
  "icmp.run.timeout": "Таймаут вне пределов {min}..{max} мс",
  "icmp.validate.badTarget": "Введите корректный домен или IP-адрес",
  "icmp.validate.targetLimit": "Целей больше предела в {limit}",

  // ── Ping: пресеты ────────────────────────────────────────────────────────
  "icmp.preset.revertedCleared":
    "Изменения отменены. Цели и параметры изменились: результаты очищены.",
  "icmp.preset.replaceMessage": "Текущие цели и результаты будут заменены пресетом «{title}».",
  "icmp.preset.replaceRunningMessage":
    "Текущие цели и результаты будут заменены пресетом «{title}». Идущая проверка будет остановлена.",
  "icmp.preset.warnTargets": "Пропущено целей: {count}",
  "icmp.preset.warnLimit": "Список ограничен {limit} целями",

  // ── Ошибки ядра ──────────────────────────────────────────────────────────
  // Код ошибки — контракт с Rust: ядро присылает код и подстановки, а текст
  // живёт здесь. Неизвестный код показывает русский `fallback` из ядра.
  "errors.core.unexpected": "{reason}",
  "errors.run.idMissing": "Не указан идентификатор проверки",
  "errors.run.exists": "Проверка с этим идентификатором уже идёт",
  "errors.run.registry": "Реестр проверок недоступен",
  "errors.core.noStorage": "Хранилище не запущено: приложение заблокировано",
  "errors.core.folder": "Неизвестная папка: «{folder}»",
  "errors.core.openFolder": "Не удалось открыть «{path}»: {reason}",

  // ── Ошибки запуска ───────────────────────────────────────────────────────
  // Заголовок блокирующего экрана — тоже код: причина отказа у каждого своя.
  "errors.startup.storage": "Не удалось найти папку программы",
  "errors.startup.write": "Программа не может сохранять файлы",
  "errors.startup.logging": "Не удалось начать запись журнала",
  "errors.startup.profileMissing":
    "Активный профиль «{profile}» не найден среди папок «{path}»; выбран «{chosen}»",

  // ── Ошибки шины ──────────────────────────────────────────────────────────
  "errors.bus.badEvent": "Некорректное событие «{topic}»: {reason}",
  "errors.bus.badCommand": "Некорректная команда «{topic}»: {reason}",
  "errors.bus.notSerialized": "Событие не удалось сериализовать",
  "errors.bus.unknownEvent": "Неизвестное событие: «{topic}»",
  "errors.bus.unknownCommand": "Неизвестная команда: «{topic}»",
  "errors.bus.timeout": "Таймаут ожидания ответа на «{topic}»",
  "errors.bus.duplicateHandler": "Команде «{topic}» уже назначен обработчик",
  "errors.bus.lost": "Событие потеряно: приёмник недоступен",
  "errors.bus.handlerPanic": "Обработчик события упал",
  "errors.bus.undelivered": "Событие «{topic}» не доставлено в интерфейс",

  // ── Ошибки журнала и окна ────────────────────────────────────────────────
  "errors.logging.installed": "Файловый лог уже запущен: {reason}",
  "errors.window.flush": "Поток сохранения геометрии завершился с паникой",
  "errors.window.missing": "Главное окно не найдено",
  "errors.window.move": "Не удалось переместить окно",
  "errors.window.resize": "Не удалось изменить размер окна",

  "errors.files.read": "Не удалось прочитать «{path}»: {reason}",
  "errors.files.write": "Не удалось записать «{path}»: {reason}",
  "errors.files.rename": "Не удалось переименовать «{path}» в «{target}»: {reason}",
  "errors.files.create": "Не удалось создать «{path}»: {reason}",
  "errors.files.move": "Не удалось перенести «{path}» в «{target}»: {reason}",
  "errors.files.broken": "Файл «{path}» не разобран: {reason}",
  "errors.files.notObject": "Файл «{path}» должен содержать объект JSON",
  "errors.storage.exe": "Не удалось определить путь к программе: {reason}",
  "errors.storage.noFolder": "У пути к программе нет папки: {path}",
  "errors.storage.create": "Не удалось создать папку «{path}»: {reason}",
  "errors.storage.pathIsFile": "По пути «{path}» уже лежит файл, а программа ожидает папку",
  "errors.storage.denied": "Нет прав на запись в «{path}»",
  "errors.storage.remove": "Не удалось удалить «{path}»: {reason}",
  "errors.storage.readFolder": "Не удалось прочитать папку «{path}»: {reason}",
  "errors.storage.missingFolder": "Папка «{path}» не найдена",
  "errors.workspace.saveNotObject": "Рабочее пространство должно быть объектом JSON",
  "errors.workspace.serialize": "Рабочее пространство не сериализовано: {reason}",
  "errors.settings.read": "Не удалось прочитать «{path}»: {reason}; взяты значения по умолчанию",
  "errors.settings.broken":
    "Файл «{path}» не разобран как JSON: {reason}; взяты значения по умолчанию",
  "errors.settings.notObject": "Файл «{path}» должен содержать объект; взяты значения по умолчанию",
  "errors.settings.version":
    "В файле «{path}» версия схемы {version}, программа знает {expected}; файл прочитан как есть",
  "errors.settings.versionType":
    "Поле version в «{path}» должно быть числом; взята версия {expected}",
  "errors.settings.profileType":
    "Поле active_profile в «{path}» должно быть строкой; взято «{profile}»",
  "errors.settings.profileInvalid": "Поле active_profile в «{path}» не годится; взято «{profile}»",
  "errors.settings.section":
    "Раздел «{section}» в «{path}» не прочитан: {reason}; взяты значения по умолчанию",
  "errors.settings.serialize": "Настройки не сериализованы: {reason}",
  "errors.settings.unknownSection": "Неизвестный раздел настроек: «{section}»",
  "errors.settings.sectionSerialize": "Раздел «{section}» не сериализован: {reason}",
  "errors.settings.sectionNotObject": "Раздел «{section}» не является объектом",
  "errors.settings.sectionPatch": "Раздел «{section}» должен быть объектом",
  "errors.settings.sectionRejected": "Раздел «{section}» не принят: {reason}",
  "errors.settings.profilePatch": "Раздел «{section}» должен быть строкой",
  "errors.languages.invalidCode": "Недопустимый код языка «{code}»",
  "errors.languages.sampleNotObject": "Не удалось подготовить словарь: неверный формат",
  "errors.languages.exists": "Файл «{path}» уже существует: образец не перезаписывается",
  "errors.languages.existsFile": "Файл «{path}» уже существует: выгрузка не перезаписывает словарь",
  "errors.languages.serialize": "Не удалось записать словарь: {reason}",
  "errors.languages.missingFile": "Словаря «{path}» нет",
  "errors.languages.updatesRemove": "Не удалось убрать файл изменений «{path}»: {reason}",
  "errors.languages.parse": "Строка {line}, столбец {column}: {reason}",
  "errors.languages.notObject": "Ожидался объект с полями «name» и «messages»",
  "errors.languages.messagesType": "Поле «messages» должно быть объектом",
  "errors.languages.messagesMissing": "Нет поля «messages»",
  "errors.languages.category":
    "Ключ «{key}»: неизвестная категория склонения «{category}»; допустимы zero, one, two, few, many, other",
  "errors.languages.forms": "Ключ «{key}»: формы должны быть строками",
  "errors.languages.message": "Ключ «{key}» должен быть строкой или набором форм",

  // ── Ошибки DNSlookup ─────────────────────────────────────────────────────
  "errors.dnslookup.noStorage": "Хранилище профиля недоступно",
  "errors.dnslookup.emptyQueries": "Список запросов пуст",
  "errors.dnslookup.tooManyQueries": "Слишком много запросов: {count}, предел {limit}",
  "errors.dnslookup.noServers": "Не выбран ни один сервер",
  "errors.dnslookup.tooManyServers": "Слишком много серверов: {count}, предел {limit}",
  "errors.dnslookup.recordType": "Неизвестный тип записи «{value}»",
  "errors.dnslookup.emptyName": "Имя домена пустое",
  "errors.dnslookup.ipForType": "Для типа {recordType} укажите доменное имя, а не IP-адрес",
  "errors.dnslookup.badName": "Некорректное имя «{name}»: {reason}",
  "errors.dnslookup.reverse": "Не удалось построить reverse-имя: {reason}",
  "errors.dnslookup.emptyAddress": "Адрес сервера пустой",
  "errors.dnslookup.requestBuild": "Не удалось собрать DNS-запрос: {reason}",
  "errors.dnslookup.socketOpen": "Не удалось открыть UDP-сокет: {reason}",
  "errors.dnslookup.tooLarge": "DNS-запрос больше 65535 байт",
  "errors.dnslookup.emptyReply": "Сервер вернул пустой TCP-ответ",
  "errors.dnslookup.badReply": "Ответ не разобран: {reason}",
  "errors.dnslookup.wrongId": "Идентификатор ответа не совпал с запросом",
  "errors.dnslookup.notReply": "Получено не сообщение-ответ",
  "errors.dnslookup.unexpectedCode": "Неожиданный код ответа DNS: {code}",
  "errors.dnslookup.network": "Ошибка сети: {reason}",
  "errors.dnslookup.servers.version":
    "Неподдерживаемая версия файла «{path}»: {version}; ожидалась {expected}",
  "errors.dnslookup.servers.serialize": "Свои серверы не сериализованы: {reason}",
  "errors.dnslookup.servers.emptyId": "У своего сервера пустой идентификатор",
  "errors.dnslookup.servers.duplicateId": "Идентификатор сервера «{id}» повторяется",
  "errors.dnslookup.servers.system": "Не удалось прочитать сетевые адаптеры: {reason}",
  "errors.icmp.emptyTargets": "Список целей пуст",
  "errors.icmp.targetId": "Не указан идентификатор цели",
  "errors.icmp.emptyTarget": "Пустая цель проверки",
  "errors.icmp.duplicateTarget": "Цель {targetId} указана дважды",
  "errors.icmp.invalidTarget": "Неверная цель «{target}»",
  "errors.icmp.familyMismatch": "Адрес {target} не относится к выбранному семейству {family}",
  "errors.icmp.noAddresses": "У {target} нет адресов семейства {family}",
  "errors.icmp.resolveFailed": "Не удалось разрешить {target}: {reason}",
  "errors.icmp.tooManyAddresses":
    "После разрешения имён получилось {count} адресов, предел {limit}",
  "errors.icmp.openHandle": "Не удалось открыть ICMP: {reason}",
  "errors.icmp.echoFailed": "Проверка {address} не выполнена: {reason}",
  "errors.icmp.echoStatus": "Проверка {address} вернула код {code}",
  "errors.icmp.unsupportedPlatform": "Проверка ICMP недоступна на этой платформе",
  "errors.profiles.notFound": "Профиль «{id}» не найден",
  "errors.profiles.active": "Нельзя удалить активный профиль: сначала переключитесь на другой",
  "errors.profiles.emptyId": "Идентификатор профиля пуст",
  "errors.profiles.invalidId": "В идентификаторе профиля допустимы латиница, цифры, «-» и «_»",
  "errors.profiles.emptyTitle": "Название профиля не может быть пустым",
  "errors.profiles.longTitle": "Название профиля длиннее {limit} символов",
  "errors.profiles.serialize": "Профиль не сериализован: {reason}",
  "errors.profiles.broken": "Файл профиля «{path}» не разобран: {reason}; умолчания скрыты",
  "errors.presets.invalidTool": "Недопустимый идентификатор инструмента",
  "errors.presets.invalidProfile": "Не удалось определить профиль пресета по пути «{path}»",
  "errors.presets.notFound": "Пресет «{id}» не найден",
  "errors.presets.emptyId": "Идентификатор пресета пуст",
  "errors.presets.invalidId": "В идентификаторе пресета допустимы латиница, цифры, «-» и «_»",
  "errors.presets.missing": "Файл «{path}» исчез между чтением папки и чтением пресета",
  "errors.presets.version": "Пресет «{path}» записан в версии {version}, ожидалась {expected}",
  "errors.presets.tool": "Пресет «{path}» относится к инструменту «{tool}», а не к «{expected}»",
  "errors.presets.payloadFile":
    "Пресет «{path}» не содержит настроек: payload должен быть JSON-объектом",
  "errors.presets.serialize": "Пресет не сериализован: {reason}",
  "errors.presets.payload": "Настройки пресета должны быть JSON-объектом",
  "errors.presets.emptyTitle": "Название пресета не может быть пустым",
  "errors.presets.longTitle": "Название пресета длиннее {limit} символов",
};

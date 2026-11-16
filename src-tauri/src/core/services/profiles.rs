//! Профили: папки `profiles/<id>/` (ADR 0010).
//!
//! Реестра профилей нет: список — это содержимое `profiles/`. Поэтому папка
//! без файла `profile.json` всё равно остаётся профилем: скрыть её значило бы
//! спрятать данные пользователя из-за одного испорченного файла.
//!
//! Идентификатор — имя папки, и при переименовании он не меняется: название
//! лежит внутри `profile.json`. Так переименование не двигает файлы,
//! а конфликт синхронизации затрагивает одну сущность, а не весь профиль.
//!
//! Идентификатор собирается из названия транслитерацией: папку могут
//! положить на сетевую шару и синхронизировать, а кириллица в путях там
//! переживает не всякий инструмент. Название при этом остаётся русским.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{Map, Value};

use crate::core::store::files::{read, strip_bom, write_atomic};
use crate::core::store::names;
use crate::core::store::stats;
use crate::core::store::storage::DEFAULT_PROFILE;

/// Файл с названием профиля внутри его папки.
pub const PROFILE_FILE: &str = "profile.json";

/// Версия схемы `profile.json`.
pub const VERSION: u32 = 1;

/// Название профиля по умолчанию: он создаётся при первом запуске.
pub const DEFAULT_TITLE: &str = "Работа";

/// Предел длины названия: длиннее в подписи сайдбара всё равно не влезет.
const MAX_TITLE_LEN: usize = 60;

/// Профиль для интерфейса.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Profile {
    /// Идентификатор: имя папки в `profiles/`, только латиница и цифры.
    pub id: String,
    /// Название для интерфейса из `profile.json`.
    pub title: String,
    /// Сколько шаблонов лежит в профиле: подпись строки в списке.
    pub templates: u64,
    /// Сколько пресетов настроек лежит в профиле.
    pub presets: u64,
    /// Сколько файлов данных инструментов: подпись строки в списке.
    pub data_files: u64,
}

/// Список профилей вместе с активным.
///
/// Активный приходит здесь же: интерфейсу он нужен всегда вместе со списком,
/// а два отдельных вызова могли бы разойтись между собой.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ProfileList {
    pub active: String,
    pub items: Vec<Profile>,
}

/// Читает профили.
///
/// Отсутствие папки — не поломка: приложение ещё не создало её, профилей нет.
/// Папки с недопустимым именем (чужие каталоги, служебные `*.tmp`)
/// пропускаются: профиль в них не лежит.
pub fn list(dir: &Path) -> Result<Vec<Profile>, String> {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => {
            return Err(format!("Не удалось прочитать '{}': {error}", dir.display()));
        }
    };

    let mut profiles = Vec::new();
    for entry in entries {
        let entry =
            entry.map_err(|error| format!("Не удалось прочитать '{}': {error}", dir.display()))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let Some(id) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if validate_id(id).is_err() {
            continue;
        }

        let title = read_title(&path).unwrap_or_else(|| id.to_owned());
        let usage = stats::profile_usage(&path);
        profiles.push(Profile {
            id: id.to_owned(),
            title,
            templates: usage.templates,
            presets: usage.presets,
            data_files: usage.data_files,
        });
    }

    // Порядок — по названию: пользователь ищет профиль глазами, а не по id.
    profiles.sort_by_cached_key(|profile| (profile.title.to_lowercase(), profile.id.clone()));
    Ok(profiles)
}

/// Создаёт профиль из названия.
///
/// Идентификатор собирается из названия, конфликт решается суффиксом:
/// два профиля «Работа» на разных машинах — обычное дело, а совпадать
/// имена папок не могут.
pub fn create(dir: &Path, title: &str) -> Result<Profile, String> {
    let title = normalize_title(title)?;
    let id = names::unique_id(dir, &names::slug(&title, "profile"));
    let path = dir.join(&id);

    fs::create_dir_all(&path)
        .map_err(|error| format!("Не удалось создать '{}': {error}", path.display()))?;

    if let Err(error) = write_profile(&path, &title) {
        // Пустая папка после отказа выглядела бы профилем без названия.
        let _ = fs::remove_dir(&path);
        return Err(error);
    }

    Ok(Profile {
        id,
        title,
        templates: 0,
        presets: 0,
        data_files: 0,
    })
}

/// Переименовывает профиль: меняется название, папка остаётся на месте.
pub fn rename(dir: &Path, id: &str, title: &str) -> Result<Profile, String> {
    let title = normalize_title(title)?;
    let path = profile_dir(dir, id)?;

    write_profile(&path, &title)?;
    let usage = stats::profile_usage(&path);
    Ok(Profile {
        id: id.to_owned(),
        title,
        templates: usage.templates,
        presets: usage.presets,
        data_files: usage.data_files,
    })
}

/// Удаляет профиль в корзину `local/trash/`.
///
/// Удаление именно переносом: профиль — папка с данными, и промах в меню
/// не должен стоить пользователю списков. Корзину чистят руками.
pub fn delete(profiles_dir: &Path, trash_dir: &Path, id: &str) -> Result<PathBuf, String> {
    let path = profile_dir(profiles_dir, id)?;

    fs::create_dir_all(trash_dir)
        .map_err(|error| format!("Не удалось создать '{}': {error}", trash_dir.display()))?;

    let target = trash_dir.join(names::unique_id(trash_dir, id));
    fs::rename(&path, &target).map_err(|error| {
        format!(
            "Не удалось перенести '{}' в '{}': {error}",
            path.display(),
            target.display()
        )
    })?;

    Ok(target)
}

/// Создаёт профиль по умолчанию, если профилей нет вовсе.
///
/// Первый запуск обязан дать рабочую папку: без профиля некуда положить
/// шаблоны и данные, а пустой список профилей выглядел бы поломкой.
/// `Some` — профиль создан, `None` — профили уже были.
pub fn ensure_default(dir: &Path) -> Result<Option<Profile>, String> {
    fs::create_dir_all(dir)
        .map_err(|error| format!("Не удалось создать '{}': {error}", dir.display()))?;

    let path = dir.join(DEFAULT_PROFILE);

    // Папка `work` могла остаться от проверки записи прежней версии: тогда
    // файла с названием в ней нет, и профиль показывался бы как «work».
    // Название дописывается, данные при этом не трогаются.
    if !list(dir)?.is_empty() {
        if path.is_dir() && !path.join(PROFILE_FILE).is_file() {
            write_profile(&path, DEFAULT_TITLE)?;
            return Ok(Some(Profile {
                id: DEFAULT_PROFILE.to_owned(),
                title: DEFAULT_TITLE.to_owned(),
                templates: 0,
                presets: 0,
                data_files: 0,
            }));
        }
        return Ok(None);
    }

    fs::create_dir_all(&path)
        .map_err(|error| format!("Не удалось создать '{}': {error}", path.display()))?;
    write_profile(&path, DEFAULT_TITLE)?;

    Ok(Some(Profile {
        id: DEFAULT_PROFILE.to_owned(),
        title: DEFAULT_TITLE.to_owned(),
        templates: 0,
        presets: 0,
        data_files: 0,
    }))
}

/// Проверяет идентификатор профиля.
///
/// Идентификатор — имя папки, поэтому в нём допустимы только символы,
/// одинаково понятные файловой системе, архиву и синхронизации.
pub fn validate_id(id: &str) -> Result<(), String> {
    if id.is_empty() {
        return Err("Идентификатор профиля пуст".to_owned());
    }
    if !names::is_safe_id(id) {
        return Err("В идентификаторе профиля допустимы латиница, цифры, '-' и '_'".to_owned());
    }
    Ok(())
}

/// Папка профиля, проверенная на существование.
fn profile_dir(dir: &Path, id: &str) -> Result<PathBuf, String> {
    validate_id(id)?;
    let path = dir.join(id);
    if !path.is_dir() {
        return Err(format!("Профиль '{id}' не найден"));
    }
    Ok(path)
}

/// Читает название из `profile.json`.
///
/// `None` — файла нет или он испорчен: профиль остаётся видимым под именем
/// папки. Молча прятать его нельзя, показывать пустую подпись — тоже.
fn read_title(dir: &Path) -> Option<String> {
    let raw = read(&dir.join(PROFILE_FILE)).ok()??;
    let value: Value = serde_json::from_str(strip_bom(&raw)).ok()?;
    let title = value.get("title")?.as_str()?.trim();
    if title.is_empty() {
        return None;
    }
    Some(title.to_owned())
}

/// Записывает `profile.json`, сохраняя незнакомые ключи.
///
/// Файл правят руками, и терять чужие поля при переименовании нельзя.
/// Испорченный файл перезаписывается: название сохранить нужно в любом
/// случае, а исправлять документ вручную пользователь не обязан.
fn write_profile(dir: &Path, title: &str) -> Result<(), String> {
    let mut document = document(dir)?;
    document.insert("version".to_owned(), Value::from(VERSION));
    document.insert("title".to_owned(), Value::from(title));
    write_document(dir, &document)
}

/// Читает `profile.json` как объект.
///
/// Отсутствующий файл — профиль без названия. Испорченный JSON — пустой
/// документ: название и умолчания неизвестны, но профиль остаётся видимым.
/// Ошибка чтения возвращается вызывающему: иначе запись стёрла бы файл,
/// который всего лишь не удалось прочитать.
pub fn document(dir: &Path) -> Result<Map<String, Value>, String> {
    let path = dir.join(PROFILE_FILE);
    let Some(raw) = read(&path)? else {
        return Ok(Map::new());
    };
    Ok(match serde_json::from_str(strip_bom(&raw)) {
        Ok(Value::Object(map)) => map,
        _ => Map::new(),
    })
}

/// Правит `profile.json` одной функцией: чтение, изменение, атомарная запись.
///
/// Документ принадлежит профилю, но разделы в нём — чужие домены
/// (`defaults` — пресетам). Поэтому сервис отдаёт документ, а не знает,
/// что в нём лежит.
pub fn update_document(
    dir: &Path,
    change: impl FnOnce(&mut Map<String, Value>) -> Result<(), String>,
) -> Result<(), String> {
    let mut document = document(dir)?;
    change(&mut document)?;
    write_document(dir, &document)
}

/// Причина, по которой `profile.json` не разобран; `None` — файл цел.
///
/// Проверка отдельная: читатель умолчаний обязан отдать пустое значение,
/// а пользователь — узнать, почему умолчание пропало.
pub fn document_warning(dir: &Path) -> Result<Option<String>, String> {
    let path = dir.join(PROFILE_FILE);
    let Some(raw) = read(&path)? else {
        return Ok(None);
    };
    match serde_json::from_str::<Value>(strip_bom(&raw)) {
        Ok(_) => Ok(None),
        Err(error) => Ok(Some(format!(
            "файл профиля '{}' не разобран: {error}; умолчания скрыты",
            path.display()
        ))),
    }
}

/// Перезаписывает `profile.json` атомарно: папка может лежать на сетевой шаре.
fn write_document(dir: &Path, document: &Map<String, Value>) -> Result<(), String> {
    let path = dir.join(PROFILE_FILE);
    let text = serde_json::to_string_pretty(&Value::Object(document.clone()))
        .map_err(|error| format!("Профиль не сериализован: {error}"))?;
    write_atomic(&path, &format!("{text}\n"))
}

/// Проверяет и обрезает название.
fn normalize_title(title: &str) -> Result<String, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("Название профиля не может быть пустым".to_owned());
    }
    if title.chars().count() > MAX_TITLE_LEN {
        return Err(format!(
            "Название профиля длиннее {MAX_TITLE_LEN} символов"
        ));
    }
    Ok(title.to_owned())
}

#[cfg(test)]
mod tests {
    //! Проверки касаются двух поломок, которые видит пользователь: профиль
    //! с нечитаемым идентификатором и потеря данных при удалении. Остальное
    //! разбирается на живом приложении.

    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("toolbox-profiles-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).expect("временная папка");
        path
    }

    #[test]
    fn create_builds_folder_and_file() {
        let dir = temp_dir("create");
        let profile = create(&dir, " Дом ").expect("профиль");

        assert_eq!(profile.id, "dom");
        assert_eq!(profile.title, "Дом");

        let document = fs::read_to_string(dir.join("dom").join(PROFILE_FILE)).expect("файл");
        assert!(document.contains("\"title\": \"Дом\""), "файл: {document}");
        assert!(document.contains("\"version\": 1"), "файл: {document}");
    }

    #[test]
    fn duplicate_title_gets_suffix() {
        let dir = temp_dir("duplicate");

        let first = create(&dir, "Работа").expect("первый");
        let second = create(&dir, "Работа").expect("второй");

        assert_eq!(first.id, "rabota");
        assert_eq!(second.id, "rabota-2");
    }

    #[test]
    fn rename_keeps_folder_and_unknown_keys() {
        let dir = temp_dir("rename");
        let profile = create(&dir, "Работа").expect("профиль");
        let path = dir.join(&profile.id).join(PROFILE_FILE);
        fs::write(&path, "{ \"version\": 1, \"title\": \"Старое\", \"note\": \"руками\" }")
            .expect("файл с чужим полем");

        let renamed = rename(&dir, &profile.id, "Офис").expect("переименование");

        assert_eq!(renamed.id, profile.id, "папка не двигается");
        assert_eq!(renamed.title, "Офис");
        let document = fs::read_to_string(&path).expect("файл");
        assert!(document.contains("\"note\": \"руками\""), "файл: {document}");
        assert!(document.contains("\"title\": \"Офис\""), "файл: {document}");
    }

    #[test]
    fn delete_moves_profile_to_trash() {
        // Корзина лежит вне `profiles/`: внутри неё она сама выглядела бы
        // профилем с именем `trash`.
        let root = temp_dir("delete");
        let dir = root.join("profiles");
        fs::create_dir_all(&dir).expect("папка профилей");
        let trash = root.join("local").join("trash");
        let profile = create(&dir, "Работа").expect("профиль");

        let target = delete(&dir, &trash, &profile.id).expect("удаление");

        assert_eq!(target, trash.join("rabota"));
        assert!(target.is_dir(), "профиль должен лежать в корзине");
        assert!(!dir.join(&profile.id).exists(), "папки профиля больше нет");
        assert!(list(&dir).expect("список").is_empty());
    }

    #[test]
    fn second_delete_does_not_overwrite_trash() {
        // Два профиля с одинаковым id попасть в корзину не могут, а вот
        // повторное удаление после создания заново — может.
        let root = temp_dir("trash-twice");
        let dir = root.join("profiles");
        fs::create_dir_all(&dir).expect("папка профилей");
        let trash = root.join("local").join("trash");

        let first = create(&dir, "Работа").expect("первый");
        let first_target = delete(&dir, &trash, &first.id).expect("первое удаление");
        let second = create(&dir, "Работа").expect("второй");
        let second_target = delete(&dir, &trash, &second.id).expect("второе удаление");

        assert_eq!(first_target, trash.join("rabota"));
        assert_eq!(second_target, trash.join("rabota-2"));
        assert!(first_target.is_dir() && second_target.is_dir());
    }

    #[test]
    fn listing_uses_titles_and_skips_junk() {
        let dir = temp_dir("list");
        create(&dir, "Работа").expect("профиль");
        create(&dir, "Дом").expect("профиль");
        // Чужие файлы в папке профилей профилями не считаются.
        fs::write(dir.join("заметка.txt"), "не профиль").expect("файл");
        fs::write(dir.join("profile.json.tmp"), "{}").expect("временный файл");

        let profiles = list(&dir).expect("список");

        let titles: Vec<&str> = profiles.iter().map(|profile| profile.title.as_str()).collect();
        assert_eq!(titles, ["Дом", "Работа"], "порядок по названию");
    }

    #[test]
    fn profile_without_file_stays_visible() {
        let dir = temp_dir("no-file");
        fs::create_dir_all(dir.join("misc")).expect("папка без файла");

        let profiles = list(&dir).expect("список");

        assert_eq!(profiles.len(), 1);
        assert_eq!(profiles[0].id, "misc");
        assert_eq!(profiles[0].title, "misc", "подпись — имя папки");
    }

    #[test]
    fn default_profile_is_created_once() {
        let dir = temp_dir("default");

        let created = ensure_default(&dir).expect("создание").expect("профиль");
        let again = ensure_default(&dir).expect("повтор").is_none();

        assert_eq!(created.id, DEFAULT_PROFILE);
        assert_eq!(created.title, DEFAULT_TITLE);
        assert!(again, "второй профиль сам не появляется");
        assert!(dir.join(DEFAULT_PROFILE).join(PROFILE_FILE).is_file());
    }

    #[test]
    fn empty_default_folder_gets_title() {
        // Проверка записи прежней версии создавала `profiles/work` без файла.
        let dir = temp_dir("default-leftover");
        fs::create_dir_all(dir.join(DEFAULT_PROFILE)).expect("папка от пробы");

        let created = ensure_default(&dir).expect("создание").expect("профиль");

        assert_eq!(created.id, DEFAULT_PROFILE);
        assert_eq!(created.title, DEFAULT_TITLE);
        assert!(dir.join(DEFAULT_PROFILE).join(PROFILE_FILE).is_file());
    }

    #[test]
    fn empty_title_is_rejected() {
        let dir = temp_dir("empty-title");
        let error = create(&dir, "   ").expect_err("пустое название");

        assert!(error.contains("пустым"), "причина: {error}");
        assert!(list(&dir).expect("список").is_empty(), "папка не создана");
    }

    #[test]
    fn corrupt_profile_reports_reason() {
        let dir = temp_dir("default-preset-warning");
        let profile = create(&dir, "Работа").expect("профиль");
        let path = dir.join(&profile.id);
        fs::write(path.join(PROFILE_FILE), "{ \"defaults\": ").expect("битый файл");

        let warning = document_warning(&path)
            .expect("чтение")
            .expect("причина");
        assert!(warning.contains("не разобран"), "причина: {warning}");
    }

    #[test]
    fn clean_profile_has_no_warning() {
        let dir = temp_dir("default-preset-clean");
        let profile = create(&dir, "Работа").expect("профиль");

        assert_eq!(
            document_warning(&dir.join(&profile.id)).expect("чтение"),
            None
        );
    }

    #[test]
    fn id_with_separators_is_rejected() {
        for id in ["../дом", "a/b", "дом", ""] {
            assert!(validate_id(id).is_err(), "идентификатор '{id}' недопустим");
        }
    }
}

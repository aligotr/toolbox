//! Шаблоны вкладок: `profiles/<id>/templates/<templateId>.json` (ADR 0011).
//!
//! Шаблон устроен как профиль: название для человека и стабильный
//! идентификатор-имя файла. Переименование меняет только `title`, поэтому
//! папка профиля не двигается, а конфликт синхронизации затрагивает один
//! документ, а не весь профиль.
//!
//! Хранится только геометрия: колонки, инструменты и ширины. Введённые
//! значения и результаты запросов не сохраняются — шаблон описывает рабочее
//! место, а не данные, и старый результат в нём был бы ложью.
//!
//! Содержимое `columns` не разбирается по полям: формат колонки принадлежит
//! интерфейсу, и новое свойство колонки не должно требовать правки Rust.
//! Проверяется только внешний договор — «это массив колонок».

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{Map, Value};

use crate::core::infra::error::{fail, AppError, AppResult};
use crate::core::store::files::{read, strip_bom, write_atomic};
use crate::core::store::names;

/// Расширение файла шаблона.
const EXTENSION: &str = "json";

/// Версия схемы файла шаблона.
pub const VERSION: u32 = 1;

/// Предел длины названия: длиннее карточка всё равно не покажет.
const MAX_TITLE_LEN: usize = 60;

/// Шаблон для интерфейса.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Template {
    /// Идентификатор: имя файла без расширения.
    pub id: String,
    /// Название для интерфейса из `title`.
    pub title: String,
    /// Геометрия вкладки как есть: массив колонок.
    pub layout: Value,
}

/// Список шаблонов вместе с замечаниями о непрочитанных файлах.
///
/// Замечания возвращаются вызывающему, а не пишутся в лог: испорченный
/// шаблон — факт работы подсистемы, его место в журнале интерфейса (ADR 0004).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct TemplateList {
    pub items: Vec<Template>,
    pub warnings: Vec<AppError>,
}

/// Читает шаблоны профиля.
///
/// Битый файл не мешает остальным: он пропускается с причиной в `warnings`.
/// Прятать его молча нельзя — пользователь не понял бы, почему шаблон исчез.
pub fn list(dir: &Path) -> AppResult<TemplateList> {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(TemplateList {
                items: Vec::new(),
                warnings: Vec::new(),
            });
        }
        Err(error) => {
            return fail!(
                "errors.templates.read",
                format!("Не удалось прочитать '{}': {error}", dir.display()),
                path = dir.display(),
                reason = error,
            );
        }
    };

    let mut items = Vec::new();
    let mut warnings = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|error| {
            AppError::new(
                "errors.templates.read",
                format!("Не удалось прочитать '{}': {error}", dir.display()),
            )
            .with("path", dir.display())
            .with("reason", error)
        })?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let Some(stem) = path.file_stem().and_then(|stem| stem.to_str()) else {
            continue;
        };
        if path.extension().and_then(|extension| extension.to_str()) != Some(EXTENSION) {
            continue;
        }
        if !names::is_safe_id(stem) {
            continue;
        }

        let document = match read_document(&path) {
            Ok(document) => document,
            Err(reason) => {
                warnings.push(reason);
                continue;
            }
        };

        if document.get("version").and_then(Value::as_u64) != Some(u64::from(VERSION)) {
            warnings.push(
                AppError::new(
                    "errors.templates.version",
                    format!(
                        "шаблон '{}' не прочитан: версия {}, ожидалась {VERSION}",
                        path.display(),
                        document
                            .get("version")
                            .map(Value::to_string)
                            .unwrap_or_else(|| "отсутствует".to_owned())
                    ),
                )
                .with("path", path.display())
                .with("version", document.get("version").map_or_else(
                    || "—".to_owned(),
                    Value::to_string,
                ))
                .with("expected", VERSION),
            );
            continue;
        }

        let title = title_of(&document, stem);

        items.push(Template {
            id: stem.to_owned(),
            title,
            layout: layout_of(&document),
        });
    }

    // Порядок — по названию: пользователь ищет шаблон глазами, а не по id.
    items.sort_by_cached_key(|template| (template.title.to_lowercase(), template.id.clone()));

    Ok(TemplateList { items, warnings })
}

/// Создаёт шаблон из названия и геометрии.
///
/// Идентификатор собирается из названия, конфликт решается суффиксом: два
/// шаблона «DNS» — обычное дело, а совпадать имена файлов не могут.
pub fn create(dir: &Path, title: &str, layout: Value) -> AppResult<Template> {
    let title = normalize_title(title)?;
    ensure_layout(&layout)?;

    fs::create_dir_all(dir).map_err(|error| {
        AppError::new(
            "errors.templates.create",
            format!("Не удалось создать '{}': {error}", dir.display()),
        )
        .with("path", dir.display())
        .with("reason", error)
    })?;

    let id = unique_id(dir, &names::slug(&title, "template"));
    write_document(&dir.join(file_name(&id)), &title, &layout)?;

    Ok(Template { id, title, layout })
}

/// Переименовывает шаблон: меняется название, файл остаётся на месте.
///
/// Незнакомые ключи сохраняются: файл могли дополнить вручную, и терять
/// чужие поля при переименовании нельзя.
pub fn rename(dir: &Path, id: &str, title: &str) -> AppResult<Template> {
    let title = normalize_title(title)?;
    let path = template_path(dir, id)?;

    let mut document = read_current_document(&path)?;
    document.insert("version".to_owned(), Value::from(VERSION));
    document.insert("title".to_owned(), Value::from(title.as_str()));
    write_document_map(&path, &document)?;

    Ok(Template {
        id: id.to_owned(),
        title,
        layout: layout_of(&document),
    })
}

/// Обновляет геометрию шаблона из вкладки.
///
/// Название и незнакомые ключи остаются прежними: обновление — это смена
/// раскладки, а не переименование. Иначе «обновить» незаметно меняло бы
/// название, которое пользователь правил отдельно.
pub fn update(dir: &Path, id: &str, layout: Value) -> AppResult<Template> {
    ensure_layout(&layout)?;
    let path = template_path(dir, id)?;

    let mut document = read_current_document(&path)?;
    document.insert("version".to_owned(), Value::from(VERSION));
    document.insert("columns".to_owned(), layout);
    write_document_map(&path, &document)?;

    Ok(Template {
        id: id.to_owned(),
        title: title_of(&document, id),
        layout: layout_of(&document),
    })
}

/// Дублирует шаблон.
///
/// Приписку к названию даёт интерфейс: она зависит от языка программы,
/// а ядро языка не знает (ADR 0039). Пользователь нажал одну кнопку
/// и ждёт второй такой же шаблон, а не диалог.
pub fn duplicate(dir: &Path, id: &str, suffix: &str) -> AppResult<Template> {
    let path = template_path(dir, id)?;
    let document = read_current_document(&path)?;

    create(dir, &copy_title(&document, id, suffix), layout_of(&document))
}

/// Удаляет шаблон в корзину: `local/trash/templates/`.
///
/// Переносом, а не удалением: промах в меню не должен стоить пользователю
/// собранной раскладки. Корзину чистят руками.
pub fn delete(dir: &Path, trash_dir: &Path, id: &str) -> AppResult<PathBuf> {
    let path = template_path(dir, id)?;

    fs::create_dir_all(trash_dir).map_err(|error| {
        AppError::new(
            "errors.templates.create",
            format!("Не удалось создать '{}': {error}", trash_dir.display()),
        )
        .with("path", trash_dir.display())
        .with("reason", error)
    })?;

    let target = trash_dir.join(unique_file_name(trash_dir, id));
    fs::rename(&path, &target).map_err(|error| {
        AppError::new(
            "errors.templates.move",
            format!(
                "Не удалось перенести '{}' в '{}': {error}",
                path.display(),
                target.display()
            ),
        )
        .with("path", path.display())
        .with("target", target.display())
        .with("reason", error)
    })?;

    Ok(target)
}

/// Проверяет идентификатор шаблона: он становится именем файла.
fn validate_id(id: &str) -> AppResult<()> {
    if id.is_empty() {
        return fail!("errors.templates.emptyId", "Идентификатор шаблона пуст");
    }
    if !names::is_safe_id(id) {
        return fail!(
            "errors.templates.invalidId",
            "В идентификаторе шаблона допустимы латиница, цифры, '-' и '_'"
        );
    }
    Ok(())
}

/// Путь к существующему шаблону.
fn template_path(dir: &Path, id: &str) -> AppResult<PathBuf> {
    validate_id(id)?;
    let path = dir.join(file_name(id));
    if !path.is_file() {
        return fail!(
            "errors.templates.notFound",
            format!("Шаблон '{id}' не найден"),
            id = id,
        );
    }
    Ok(path)
}

/// Имя файла шаблона по идентификатору.
fn file_name(id: &str) -> String {
    format!("{id}.{EXTENSION}")
}

/// Свободный идентификатор: `base`, `base-2`, `base-3`, …
fn unique_id(dir: &Path, base: &str) -> String {
    let mut id = base.to_owned();
    let mut suffix = 2;
    while dir.join(file_name(&id)).exists() {
        id = format!("{base}-{suffix}");
        suffix += 1;
    }
    id
}

/// Свободное имя файла в корзине: `base.json`, `base-2.json`, …
fn unique_file_name(dir: &Path, base: &str) -> String {
    let mut name = file_name(base);
    let mut suffix = 2;
    while dir.join(&name).exists() {
        name = file_name(&format!("{base}-{suffix}"));
        suffix += 1;
    }
    name
}

/// Читает документ шаблона целиком: незнакомые ключи нужны при перезаписи.
fn read_document(path: &Path) -> AppResult<Map<String, Value>> {
    let Some(raw) = read(path)? else {
        return fail!(
            "errors.templates.missing",
            format!(
                "Файл '{}' исчез между чтением папки и чтением шаблона",
                path.display()
            ),
            path = path.display(),
        );
    };

    let value: Value = serde_json::from_str(strip_bom(&raw)).map_err(|error| {
        AppError::new(
            "errors.templates.broken",
            format!("Файл '{}' не разобран: {error}", path.display()),
        )
        .with("path", path.display())
        .with("reason", error)
    })?;

    let Value::Object(document) = value else {
        return fail!(
            "errors.templates.notObject",
            format!("Файл '{}' должен содержать объект шаблона", path.display()),
            path = path.display(),
        );
    };
    Ok(document)
}

/// Читает документ для изменения и отказывает чужой версии.
///
/// Иначе переименование или обновление перезаписало бы поля файла, формат
/// которого эта версия программы не знает.
fn read_current_document(path: &Path) -> AppResult<Map<String, Value>> {
    let document = read_document(path)?;
    let version = document.get("version").and_then(Value::as_u64);
    if version != Some(u64::from(VERSION)) {
        return fail!(
            "errors.templates.version",
            format!(
                "Файл '{}' записан в версии {}, ожидалась {VERSION}",
                path.display(),
                version
                    .map(|version| version.to_string())
                    .unwrap_or_else(|| "отсутствует".to_owned())
            ),
            path = path.display(),
            version = version.map_or_else(|| "—".to_owned(), |version| version.to_string()),
            expected = VERSION,
        );
    }
    Ok(document)
}

/// Пишет документ шаблона атомарно: папка может лежать на сетевой шаре.
fn write_document(path: &Path, title: &str, layout: &Value) -> AppResult<()> {
    let mut document = Map::new();
    document.insert("version".to_owned(), Value::from(VERSION));
    document.insert("title".to_owned(), Value::from(title));
    document.insert("columns".to_owned(), layout.clone());

    write_document_map(path, &document)
}

/// Перезаписывает документ целиком, сохраняя незнакомые ключи.
fn write_document_map(path: &Path, document: &Map<String, Value>) -> AppResult<()> {
    let text = serde_json::to_string_pretty(&Value::Object(document.clone())).map_err(|error| {
        AppError::new(
            "errors.templates.serialize",
            format!("Шаблон не сериализован: {error}"),
        )
        .with("reason", error)
    })?;
    write_atomic(path, &format!("{text}\n"))?;
    Ok(())
}

/// Название из документа; имя файла — запасной вариант.
fn title_of(document: &Map<String, Value>, fallback: &str) -> String {
    document
        .get("title")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|title| !title.is_empty())
        .unwrap_or(fallback)
        .to_owned()
}

/// Геометрия из документа; всё, что не массив, считается пустым.
fn layout_of(document: &Map<String, Value>) -> Value {
    match document.get("columns") {
        Some(layout @ Value::Array(_)) => layout.clone(),
        _ => Value::Array(Vec::new()),
    }
}

/// Проверяет, что геометрия — массив колонок.
fn ensure_layout(layout: &Value) -> AppResult<()> {
    if layout.is_array() {
        Ok(())
    } else {
        fail!(
            "errors.templates.layout",
            "Геометрия шаблона должна быть массивом колонок"
        )
    }
}

/// Проверяет и обрезает название.
fn normalize_title(title: &str) -> AppResult<String> {
    let title = title.trim();
    if title.is_empty() {
        return fail!(
            "errors.templates.emptyTitle",
            "Название шаблона не может быть пустым"
        );
    }
    if title.chars().count() > MAX_TITLE_LEN {
        return fail!(
            "errors.templates.longTitle",
            format!("Название шаблона длиннее {MAX_TITLE_LEN} символов"),
            limit = MAX_TITLE_LEN,
        );
    }
    Ok(title.to_owned())
}

/// Название копии с припиской; приписка обязана влезть в предел длины.
///
/// Основа — название исходного шаблона; если его в файле нет, берётся
/// идентификатор: копия всё равно получает понятную подпись.
fn copy_title(document: &Map<String, Value>, fallback: &str, suffix: &str) -> String {
    let base = document
        .get("title")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|title| !title.is_empty())
        .unwrap_or(fallback);
    let suffix: String = suffix.chars().take(MAX_TITLE_LEN).collect();
    let room = MAX_TITLE_LEN.saturating_sub(suffix.chars().count());
    let base: String = base.chars().take(room).collect();
    format!("{base}{suffix}")
}

#[cfg(test)]
mod tests {
    //! Проверяется наблюдаемое поведение: что легло в файл, что вернулось
    //! в список и что произошло с папкой при удалении.

    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let path =
            std::env::temp_dir().join(format!("toolbox-templates-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).expect("временная папка");
        path
    }

    fn layout() -> Value {
        serde_json::json!([{ "width": 1, "tools": ["dns", "ping"] }])
    }

    #[test]
    fn create_writes_geometry_and_translit_id() {
        let dir = temp_dir("create");
        let template = create(&dir, "DNS и Ping", layout()).expect("шаблон");

        assert_eq!(template.id, "dns-i-ping");
        assert_eq!(template.title, "DNS и Ping");

        let document = fs::read_to_string(dir.join("dns-i-ping.json")).expect("файл");
        assert!(document.contains("\"version\": 1"), "файл: {document}");
        assert!(
            document.contains("\"title\": \"DNS и Ping\""),
            "файл: {document}"
        );
        assert!(document.contains("\"ping\""), "файл: {document}");
    }

    #[test]
    fn duplicate_title_gets_suffix() {
        let dir = temp_dir("duplicate");
        create(&dir, "DNS", layout()).expect("первый");
        let second = create(&dir, "DNS", layout()).expect("второй");

        assert_eq!(second.id, "dns-2");
    }

    #[test]
    fn duplicate_copies_layout_and_marks_title() {
        let dir = temp_dir("copy");
        let source = create(&dir, "DNS", layout()).expect("шаблон");

        let copy = duplicate(&dir, &source.id, " (копия)").expect("копия");

        assert_eq!(copy.title, "DNS (копия)");
        assert_ne!(copy.id, source.id);
        assert_eq!(copy.layout, source.layout);
    }

    #[test]
    fn rename_keeps_file_and_unknown_keys() {
        let dir = temp_dir("rename");
        let template = create(&dir, "DNS", layout()).expect("шаблон");
        let path = dir.join(file_name(&template.id));
        fs::write(
            &path,
            "{ \"version\": 1, \"title\": \"Старое\", \"columns\": [], \"note\": \"руками\" }",
        )
        .expect("файл с чужим полем");

        let renamed = rename(&dir, &template.id, "DNS клиенты").expect("переименование");

        assert_eq!(renamed.id, template.id, "файл не двигается");
        let document = fs::read_to_string(&path).expect("файл");
        assert!(
            document.contains("\"note\": \"руками\""),
            "файл: {document}"
        );
        assert!(
            document.contains("\"title\": \"DNS клиенты\""),
            "файл: {document}"
        );
        assert!(!dir.join("dns-klienty.json").exists(), "нового файла нет");
    }

    #[test]
    fn update_replaces_geometry_and_keeps_title_and_foreign_keys() {
        let dir = temp_dir("update");
        let template = create(&dir, "DNS", layout()).expect("шаблон");
        let path = dir.join(file_name(&template.id));
        fs::write(
            &path,
            "{ \"version\": 1, \"title\": \"DNS\", \"columns\": [], \"note\": \"руками\" }",
        )
        .expect("файл с чужим полем");
        let next = serde_json::json!([{ "width": 2, "tools": ["ping"] }]);

        let updated = update(&dir, &template.id, next.clone()).expect("обновление");

        assert_eq!(updated.title, "DNS", "название не меняется");
        assert_eq!(updated.layout, next);
        let document = fs::read_to_string(&path).expect("файл");
        assert!(
            document.contains("\"note\": \"руками\""),
            "файл: {document}"
        );
        assert!(document.contains("\"ping\""), "файл: {document}");
        assert!(
            !document.contains("\"dns\""),
            "старая геометрия ушла: {document}"
        );
    }

    #[test]
    fn update_refuses_foreign_version() {
        // Иначе обновление перезаписало бы файл, формат которого неизвестен.
        let dir = temp_dir("update-foreign");
        let template = create(&dir, "DNS", layout()).expect("шаблон");
        fs::write(
            dir.join(file_name(&template.id)),
            "{ \"version\": 99, \"columns\": [] }",
        )
        .expect("чужая версия");

        let error = update(&dir, &template.id, layout()).expect_err("чужая версия");

        assert!(error.to_string().contains("версии 99"), "причина: {error}");
    }

    #[test]
    fn update_requires_template() {
        let dir = temp_dir("update-missing");
        let error = update(&dir, "ghost", layout()).expect_err("нет файла");

        assert!(error.to_string().contains("не найден"), "причина: {error}");
    }

    #[test]
    fn delete_moves_template_to_trash() {
        let root = temp_dir("delete");
        let dir = root.join("templates");
        let trash = root.join("local").join("trash").join("templates");
        let template = create(&dir, "DNS", layout()).expect("шаблон");

        let target = delete(&dir, &trash, &template.id).expect("удаление");

        assert_eq!(target, trash.join("dns.json"));
        assert!(target.is_file(), "шаблон должен лежать в корзине");
        assert!(!dir.join(file_name(&template.id)).exists());
        assert!(list(&dir).expect("список").items.is_empty());
    }

    #[test]
    fn second_delete_does_not_overwrite_trash() {
        // Тот же шаблон могли создать заново после удаления.
        let root = temp_dir("trash-twice");
        let dir = root.join("templates");
        let trash = root.join("local").join("trash").join("templates");

        let first = create(&dir, "DNS", layout()).expect("первый");
        let first_target = delete(&dir, &trash, &first.id).expect("первое удаление");
        let second = create(&dir, "DNS", layout()).expect("второй");
        let second_target = delete(&dir, &trash, &second.id).expect("второе удаление");

        assert_eq!(first_target, trash.join("dns.json"));
        assert_eq!(second_target, trash.join("dns-2.json"));
    }

    #[test]
    fn broken_template_does_not_hide_others() {
        let dir = temp_dir("broken");
        create(&dir, "DNS", layout()).expect("целый шаблон");
        fs::write(dir.join("broken.json"), "{ \"version\": 1, ").expect("битый файл");
        fs::write(
            dir.join("future.json"),
            "{ \"version\": 99, \"columns\": [] }",
        )
        .expect("чужая версия");
        // Служебные файлы шаблонами не считаются.
        fs::write(dir.join("dns.json.tmp"), "{}").expect("временный файл");

        let list = list(&dir).expect("список");

        assert_eq!(list.items.len(), 1, "шаблоны: {:?}", list.items);
        assert_eq!(list.items[0].id, "dns");
        assert_eq!(list.warnings.len(), 2, "замечания: {:?}", list.warnings);
    }

    #[test]
    fn geometry_must_be_columns() {
        let dir = temp_dir("layout");
        let error = create(&dir, "DNS", serde_json::json!({ "width": 1 }))
            .expect_err("объект вместо массива");

        assert!(error.to_string().contains("массивом"), "причина: {error}");
        assert!(!dir.join("dns.json").exists(), "файл не создан");
    }

    #[test]
    fn empty_title_is_rejected() {
        let dir = temp_dir("empty-title");
        let error = create(&dir, "   ", layout()).expect_err("пустое название");

        assert!(error.to_string().contains("пустым"), "причина: {error}");
    }
}

//! Имена сущностей из названий: профили и пресеты.
//!
//! Обе сущности устроены одинаково — русское название и стабильный
//! идентификатор-имя файла. Правило транслитерации должно быть одно:
//! расхождение дало бы кириллицу в пути у одной сущности и латиницу
//! у другой, а папка программы может лежать на сетевой шаре.
//!
//! Идентификатор собирается только из символов, одинаково понятных файловой
//! системе, архиву и синхронизации: латиница, цифры, `-` и `_`.

use std::path::Path;

/// Предел длины идентификатора: имя файла должно оставаться читаемым.
pub const MAX_ID_LEN: usize = 40;

/// Проверяет, что идентификатор пригоден как имя папки или файла.
pub fn is_safe_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .chars()
            .all(|symbol| symbol.is_ascii_alphanumeric() || symbol == '-' || symbol == '_')
}

/// Свободный идентификатор в папке: `base`, `base-2`, `base-3`, …
///
/// Проверка идёт по файловой системе, а не по списку в памяти: папку могли
/// пополнить руками или синхронизацией.
pub fn unique_id(dir: &Path, base: &str) -> String {
    let mut id = base.to_owned();
    let mut suffix = 2;
    while dir.join(&id).exists() {
        id = format!("{base}-{suffix}");
        suffix += 1;
    }
    id
}

/// Собирает идентификатор из названия.
///
/// `fallback` подставляется, когда от названия не осталось ни одного символа:
/// «???» всё равно должно дать файл.
pub fn slug(title: &str, fallback: &str) -> String {
    let mut id = String::new();
    for symbol in title.to_lowercase().chars() {
        match symbol {
            'a'..='z' | '0'..='9' => id.push(symbol),
            '-' | '_' | ' ' => push_separator(&mut id),
            _ => match translit(symbol) {
                Some(latin) => id.push_str(latin),
                None => push_separator(&mut id),
            },
        }
    }

    let mut id = id.trim_matches('-').to_owned();
    // Обрезка по байтам безопасна: в идентификаторе только латиница.
    id.truncate(MAX_ID_LEN);
    let id = id.trim_end_matches('-');
    if id.is_empty() {
        fallback.to_owned()
    } else {
        id.to_owned()
    }
}

/// Ставит один разделитель: «Работа 1» и «Работа-1» дают один идентификатор.
fn push_separator(id: &mut String) {
    if !id.is_empty() && !id.ends_with('-') {
        id.push('-');
    }
}

/// Русская буква в латиницу. Регистр не важен: название уже приведено
/// к нижнему.
fn translit(symbol: char) -> Option<&'static str> {
    let latin = match symbol {
        'а' => "a",
        'б' => "b",
        'в' => "v",
        'г' => "g",
        'д' => "d",
        'е' | 'ё' => "e",
        'ж' => "zh",
        'з' => "z",
        'и' => "i",
        'й' => "y",
        'к' => "k",
        'л' => "l",
        'м' => "m",
        'н' => "n",
        'о' => "o",
        'п' => "p",
        'р' => "r",
        'с' => "s",
        'т' => "t",
        'у' => "u",
        'ф' => "f",
        'х' => "h",
        'ц' => "c",
        'ч' => "ch",
        'ш' => "sh",
        'щ' => "sch",
        'ъ' | 'ь' => "",
        'ы' => "y",
        'э' => "e",
        'ю' => "yu",
        'я' => "ya",
        _ => return None,
    };
    Some(latin)
}

#[cfg(test)]
mod tests {
    //! Проверяется только правило имени: остальное — поведение сервисов.

    use super::*;

    #[test]
    fn id_from_title_is_latin_only() {
        assert_eq!(slug("Работа", "profile"), "rabota");
        assert_eq!(slug("Дом и семья", "profile"), "dom-i-semya");
        assert_eq!(slug("  Заказы  ", "profile"), "zakazy");
        assert_eq!(slug("DNS-клиенты", "profile"), "dns-klienty");
    }

    #[test]
    fn id_from_empty_title_has_fallback() {
        // Название из одних знаков всё равно должно дать файл.
        assert_eq!(slug("???", "profile"), "profile");
        assert_eq!(slug("", "preset"), "preset");
    }

    #[test]
    fn unsafe_ids_are_rejected() {
        for id in ["../дом", "a/b", "дом", "", "a\\b"] {
            assert!(!is_safe_id(id), "идентификатор '{id}' недопустим");
        }
        assert!(is_safe_id("dns-ping_2"));
    }
}

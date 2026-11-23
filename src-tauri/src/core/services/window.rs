//! Окно: восстановление геометрии, прилипание к краям рабочей области
//! и сохранение (ADR 0011, ADR 0064).
//!
//! Своя реализация вместо `tauri-plugin-window-state`: плагин пишет в каталог
//! данных приложения, а здесь всё состояние живёт рядом с `.exe` (ADR 0010).
//!
//! Единицы измерения в файле разные, и это осознанно:
//!
//! - **размер** — логические пиксели: на мониторе с другим масштабом окно
//!   сохраняет привычный вид, а не физический размер;
//! - **положение** — физические пиксели: это координата на общем рабочем
//!   столе, и только в них она однозначна.
//!
//! Сохранённое положение может оказаться на отключённом мониторе. Тогда окно
//! переносится на текущий: иначе оно окажется за пределами экрана, и
//! приложение будет выглядеть не запустившимся.
//!
//! Прилипание работает на событиях `Moved`: пока видимая граница окна ближе
//! порога к краю рабочей области, окно ставится вплотную. Видимая граница
//! уже внешнего прямоугольника на невидимую рамку, поэтому поправка нужна
//! и при перетаскивании, и при восстановлении (ADR 0064).

use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

use serde_json::{Map, Value};
use tauri::{LogicalSize, Monitor, PhysicalPosition, Position, Size, WebviewWindow};

use crate::core::infra::error::{AppError, AppResult};
use crate::core::services::settings::WindowSettings;

/// Минимальный размер окна. Совпадает с `minWidth`/`minHeight`
/// в `tauri.conf.json`: ограничение окна задаёт оконная система, а здесь
/// оно повторено, чтобы восстановленная геометрия не просила меньше.
pub const MIN_WIDTH: u32 = 960;
/// Минимальная высота окна.
pub const MIN_HEIGHT: u32 = 640;

/// Задержка записи после последнего события окна.
///
/// Перетаскивание окна порождает десятки событий `Moved`. Писать файл на
/// каждое — значит нагружать диск и синхронизацию ради промежуточных
/// координат, которые пользователь тут же сменит.
const DEBOUNCE_MS: u64 = 400;

/// Прямоугольник в физических пикселях.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl Rect {
    /// Попадает ли точка внутрь прямоугольника.
    ///
    /// Правая и нижняя границы исключены: мониторы стыкуются краями,
    /// и общая граница не должна принадлежать сразу двум.
    fn contains(&self, x: i32, y: i32) -> bool {
        x >= self.x && y >= self.y && x < self.right() && y < self.bottom()
    }

    fn right(&self) -> i32 {
        self.x + self.width as i32
    }

    fn bottom(&self) -> i32 {
        self.y + self.height as i32
    }
}

/// Монитор: рабочая область и масштаб.
///
/// Рабочая область монитора, а не полный размер экрана: панель задач и док
/// принадлежат системе, и окно под ними недоступно пользователю.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Screen {
    pub work_area: Rect,
    pub scale_factor: f64,
}

impl Screen {
    /// Перевод монитора Tauri в данные, пригодные для проверки без окна.
    fn from_monitor(monitor: &Monitor) -> Self {
        let area = monitor.work_area();
        Self {
            work_area: Rect {
                x: area.position.x,
                y: area.position.y,
                width: area.size.width,
                height: area.size.height,
            },
            scale_factor: normalize_scale(monitor.scale_factor()),
        }
    }
}

/// Масштаб приходит из системы; ноль или отрицательное значение сломали бы
/// деление, а монитор без масштаба ведёт себя как масштаб 1.
fn normalize_scale(scale_factor: f64) -> f64 {
    if scale_factor > 0.0 {
        scale_factor
    } else {
        1.0
    }
}

/// Размещение окна, готовое к применению.
///
/// Размер — логические пиксели (как в настройках), положение — физические.
/// `x`/`y` равны `None`, когда положение ещё не выбрано или его негде
/// проверить: тогда окно ставит по центру система.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Placement {
    pub width: f64,
    pub height: f64,
    pub x: Option<i32>,
    pub y: Option<i32>,
}

/// Рамка окна: разница между внешним и клиентским размером.
///
/// Нужна при прижатии к рабочей области монитора: в настройках хранится клиентский
/// размер, а место на экране занимает окно целиком. Рамку задаёт оконная
/// система, поэтому она измеряется у живого окна, а не задаётся числом.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Frame {
    pub width: u32,
    pub height: u32,
}

/// Невидимая вставка между внешним прямоугольником окна и его видимой
/// границей.
///
/// `GetWindowRect`, которым пользуется Tauri, отдаёт прямоугольник шире
/// видимого окна: оконная система держит запас под тень и захват для
/// изменения размера. Без поправки окно встаёт к рабочей области с щелью
/// в эту вставку. Величина зависит от масштаба экрана и версии системы,
/// поэтому измеряется, а не задаётся числом.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Inset {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

/// Порог прилипания в логических пикселях.
///
/// Шесть пикселей - мера живого клиента Steam: там окно встаёт вплотную,
/// когда видимая граница оказывается в шести пикселях от края, и идёт
/// за курсором, как только его тянут обратно. Широкий порог превращает
/// прилипание в залипание: окно приходится отрывать рывком.
const SNAP_DISTANCE: f64 = 6.0;

/// Границы внешнего прямоугольника по одной оси: от прижатия к началу
/// рабочей области до прижатия к концу.
///
/// Видимая граница окна может выступать за рабочую область на невидимую
/// вставку, поэтому обе границы сдвинуты наружу на неё. Если окно длиннее
/// рабочей области, границы совпадают: прижать его к обоим краям нельзя.
fn outer_bounds(
    area_start: i32,
    area_length: u32,
    inset_start: i32,
    inset_end: i32,
    outer_length: i32,
) -> (i32, i32) {
    let start = area_start.saturating_sub(inset_start);
    let end = area_start
        .saturating_add(area_length as i32)
        .saturating_sub(outer_length)
        .saturating_add(inset_end)
        .max(start);

    (start, end)
}

/// Подбирает геометрию, прижатую к рабочей области монитора.
///
/// Логика в три шага: найти монитор под сохранённой точкой (иначе текущий),
/// перевести размер в его физические пиксели и прижать видимую границу окна
/// внутрь рабочей области монитора. Размер уменьшается только если окно
/// физически больше экрана; положение сдвигается всегда, чтобы окно осталось
/// достижимым.
///
/// Прижатие считается по видимой границе, а не по внешнему прямоугольнику:
/// тот шире окна на невидимую вставку, и без поправки окно встало бы
/// с щелью, а сохранённое прилипшее положение откатывалось бы при каждом
/// запуске.
pub fn fit(
    saved: &WindowSettings,
    screens: &[Screen],
    current: Option<&Screen>,
    frame: Frame,
    inset: Inset,
) -> Placement {
    let width = saved.width.max(MIN_WIDTH);
    let height = saved.height.max(MIN_HEIGHT);

    let (Some(x), Some(y)) = (saved.x, saved.y) else {
        return Placement {
            width: f64::from(width),
            height: f64::from(height),
            x: None,
            y: None,
        };
    };

    // Сохранённая точка главнее текущего монитора: пользователь оставил окно
    // там, и вернуть его нужно туда же. Текущий монитор — только запасной
    // вариант, когда такой точки на столе больше нет.
    //
    // Ищется видимая точка: прилипшее к левому или верхнему краю окно
    // внешним углом выступает за рабочую область на вставку.
    let screen = screens
        .iter()
        .find(|screen| {
            screen
                .work_area
                .contains(x.saturating_add(inset.left), y.saturating_add(inset.top))
        })
        .or(current);

    let Some(screen) = screen else {
        // Мониторов не видно вообще (например, сеанс без рабочего стола):
        // гадать о положении не о чем, размер всё равно применяется.
        return Placement {
            width: f64::from(width),
            height: f64::from(height),
            x: None,
            y: None,
        };
    };

    let area = screen.work_area;
    let scale = normalize_scale(screen.scale_factor);

    // Рамка задана в физических пикселях, поэтому место под клиентскую
    // область - это рабочая область монитора плюс невидимая вставка минус
    // рамка: видимая граница может выступать за рабочую область на вставку.
    let room_width = f64::from(area.width) + f64::from(inset.left) + f64::from(inset.right);
    let room_height = f64::from(area.height) + f64::from(inset.top) + f64::from(inset.bottom);
    let available_width = (room_width - f64::from(frame.width)).max(1.0);
    let available_height = (room_height - f64::from(frame.height)).max(1.0);

    let physical_width = (f64::from(width) * scale).round();
    let physical_height = (f64::from(height) * scale).round();
    let clamped_width = physical_width.min(available_width);
    let clamped_height = physical_height.min(available_height);

    let outer_width = clamped_width + f64::from(frame.width);
    let outer_height = clamped_height + f64::from(frame.height);

    let (left_min, left_max) = outer_bounds(
        area.x,
        area.width,
        inset.left,
        inset.right,
        outer_width as i32,
    );
    let (top_min, top_max) = outer_bounds(
        area.y,
        area.height,
        inset.top,
        inset.bottom,
        outer_height as i32,
    );

    let left = x.clamp(left_min, left_max);
    let top = y.clamp(top_min, top_max);

    Placement {
        width: (clamped_width / scale).round(),
        height: (clamped_height / scale).round(),
        x: Some(left),
        y: Some(top),
    }
}

/// Состояние магнита: последняя позиция окна до прилипания и позиция,
/// которую поставил сам магнит.
///
/// Нужно, чтобы отличить движение к краю от движения прочь. К краю окно
/// притягивается, от края идёт за курсором без задержки: иначе окно
/// приходится отрывать рывком через весь порог. Собственный перенос окна
/// возвращается событием `Moved`; его нельзя принимать за движение
/// пользователя, иначе магнит отпустил бы окно сразу после прилипания.
#[derive(Debug, Default)]
pub struct SnapTracker {
    previous: Option<Rect>,
    applied: Option<Rect>,
}

impl SnapTracker {
    /// Забывает прошлое перетаскивание.
    ///
    /// Вызывается, когда кнопка мыши отпущена, окно сменило размер или
    /// монитор: старое направление движения к новому случаю не относится.
    pub fn reset(&mut self) {
        self.previous = None;
        self.applied = None;
    }

    /// Позиция окна, притянутая к краям рабочей области.
    ///
    /// `None` - окно остаётся где есть. Края считаются независимо, поэтому
    /// углы выравниваются сами. К каждому краю окно притягивается, только
    /// если движется в его сторону; движение вдоль края и остановка тоже
    /// считаются движением к краю, иначе окно отрывалось бы от дрожания мыши.
    /// Ось пропускается, если видимый размер окна больше рабочей области.
    pub fn snap(&mut self, window: Rect, area: Rect, inset: Inset, threshold: i32) -> Option<Rect> {
        // Собственный перенос окна: он приходит сразу после прилипания.
        // Его позиция становится прошлой, иначе первое же движение от края
        // сравнивалось бы с позицией до прилипания и магнит держал бы окно,
        // пока курсор не пройдёт весь зазор. Это и есть свободный ход,
        // из-за которого окно выдвигается из-за края с опозданием.
        if self.applied == Some(window) {
            self.applied = None;
            self.previous = Some(window);
            return None;
        }

        // Смена размера - это изменение размера, а не перетаскивание:
        // прилипание к краю здесь только мешает задать точный размер.
        if let Some(previous) = self.previous
            && (previous.width != window.width || previous.height != window.height)
        {
            self.reset();
            self.previous = Some(window);
            return None;
        }

        let previous = self.previous;
        let mut target = window;

        let visible_width =
            i64::from(window.width) - i64::from(inset.left) - i64::from(inset.right);
        let visible_height =
            i64::from(window.height) - i64::from(inset.top) - i64::from(inset.bottom);

        if visible_width <= i64::from(area.width) {
            let (start, end) = outer_bounds(
                area.x,
                area.width,
                inset.left,
                inset.right,
                window.width as i32,
            );
            if let Some(edge) =
                attracted(window.x, previous.map(|rect| rect.x), start, end, threshold)
            {
                target.x = edge;
            }
        }

        if visible_height <= i64::from(area.height) {
            let (start, end) = outer_bounds(
                area.y,
                area.height,
                inset.top,
                inset.bottom,
                window.height as i32,
            );
            if let Some(edge) =
                attracted(window.y, previous.map(|rect| rect.y), start, end, threshold)
            {
                target.y = edge;
            }
        }

        self.previous = Some(window);

        if target == window {
            self.applied = None;
            None
        } else {
            self.applied = Some(target);
            Some(target)
        }
    }
}

/// Край, к которому окно движется и до которого ближе порога.
///
/// `previous` - позиция окна на прошлом событии. Окно внутри порога
/// отпускается, только когда ушло с края в сторону рабочей области и
/// продолжает уходить: разворот у самого края не должен превращаться
/// в прыжок на накопленное расстояние. Равенство и движение вдоль края
/// считаются движением к краю, иначе окно отрывалось бы от дрожания мыши.
fn attracted(
    position: i32,
    previous: Option<i32>,
    start: i32,
    end: i32,
    threshold: i32,
) -> Option<i32> {
    let start_distance = (i64::from(position) - i64::from(start)).abs();
    let end_distance = (i64::from(position) - i64::from(end)).abs();
    let threshold = i64::from(threshold);

    let (edge, distance) = if start_distance <= end_distance {
        (start, start_distance)
    } else {
        (end, end_distance)
    };

    if distance > threshold {
        return None;
    }

    let stay = match previous {
        None => true,
        Some(previous) if edge == start => position <= edge || position <= previous,
        Some(previous) => position >= edge || position >= previous,
    };

    stay.then_some(edge)
}

/// Применяет размещение к окну.
pub fn apply(window: &WebviewWindow, placement: &Placement) -> tauri::Result<()> {
    window.set_size(Size::Logical(LogicalSize::new(
        placement.width,
        placement.height,
    )))?;

    if let (Some(x), Some(y)) = (placement.x, placement.y) {
        window.set_position(Position::Physical(PhysicalPosition::new(x, y)))?;
    }
    Ok(())
}

/// Итог восстановления геометрии.
///
/// Нужен вызывающему, чтобы решить, записывать ли фактическую геометрию:
/// если окно встало не там, где просили, повторять прижатие при каждом запуске
/// незачем.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Restored {
    /// Окно встало ровно так, как записано.
    AsSaved,
    /// Окно пришлось прижать к экрану или поднять до минимального размера.
    Adjusted,
}

/// Восстанавливает геометрию из настроек.
///
/// Вызывается до показа окна: пока окно скрыто, пользователь не видит скачка
/// из системного угла в сохранённое место. Развёрнутость возвращается
/// отдельно от размеров — иначе при следующем запуске окно либо открылось бы
/// развёрнутым с чужим размером, либо потеряло прежний.
pub fn restore(window: &WebviewWindow, saved: &WindowSettings) -> tauri::Result<Restored> {
    // Развёрнутое окно сначала возвращается в обычное состояние: у него
    // нет рамки, и измерять её бессмысленно.
    if window.is_maximized()? {
        window.unmaximize()?;
    }

    let screens = screens(window)?;
    let current = window
        .current_monitor()?
        .map(|monitor| Screen::from_monitor(&monitor));
    let frame = frame(window)?;
    let position = window.outer_position()?;
    let size = window.outer_size()?;
    let outer = Rect {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    };
    let placement = fit(
        saved,
        &screens,
        current.as_ref(),
        frame,
        visible_inset(window, outer),
    );

    let adjusted = placement.width != f64::from(saved.width)
        || placement.height != f64::from(saved.height)
        || placement.x != saved.x
        || placement.y != saved.y;

    apply(window, &placement)?;
    if placement.x.is_none() {
        window.center()?;
    }

    if saved.maximized {
        window.maximize()?;
    }

    Ok(if adjusted {
        Restored::Adjusted
    } else {
        Restored::AsSaved
    })
}

/// Измеряет рамку окна — разницу внешнего и клиентского размера.
fn frame(window: &WebviewWindow) -> tauri::Result<Frame> {
    let outer = window.outer_size()?;
    let inner = window.inner_size()?;
    Ok(Frame {
        width: outer.width.saturating_sub(inner.width),
        height: outer.height.saturating_sub(inner.height),
    })
}

/// Позиция, к которой магнит тянет живое окно.
///
/// `None` - окно оставить где есть. Прилипание работает только во время
/// перетаскивания: без этого окно притягивалось бы и после восстановления
/// геометрии, и после переноса из меню окна.
///
/// Развёрнутое, полноэкранное и свёрнутое окно пропускаются: их
/// прямоугольник уже совпадает с рабочей областью или с экраном.
pub fn snap_target(
    window: &WebviewWindow,
    tracker: &mut SnapTracker,
) -> tauri::Result<Option<Rect>> {
    if !dragging() {
        tracker.reset();
        return Ok(None);
    }

    if window.is_minimized()? || window.is_maximized()? || window.is_fullscreen()? {
        tracker.reset();
        return Ok(None);
    }

    let Some(monitor) = window.current_monitor()? else {
        tracker.reset();
        return Ok(None);
    };

    let screen = Screen::from_monitor(&monitor);
    let position = window.outer_position()?;
    let size = window.outer_size()?;
    let current = Rect {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    };

    // Порог задан в логических пикселях: на мониторе с масштабом 150 %
    // он равен 9 физическим, иначе магнит был бы вдвое слабее.
    let threshold = (SNAP_DISTANCE * screen.scale_factor).round() as i32;

    Ok(tracker.snap(
        current,
        screen.work_area,
        visible_inset(window, current),
        threshold,
    ))
}

/// Нажата ли левая кнопка мыши.
///
/// Прилипание живёт только на перетаскивании. На других платформах
/// состояние кнопки не читается: там магнит работает по позиции.
#[cfg(windows)]
fn dragging() -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};

    unsafe { GetAsyncKeyState(VK_LBUTTON.0 as i32) < 0 }
}

#[cfg(not(windows))]
fn dragging() -> bool {
    true
}

/// Вставка между внешним прямоугольником окна и его видимой границей.
///
/// `GetWindowRect` отдаёт прямоугольник шире видимого окна на запас под тень
/// и захват для изменения размера. Вставка нужна и при восстановлении,
/// и при прилипании: без неё окно встаёт к рабочей области с щелью в 7-8 px.
/// Неправдоподобный ответ (скрытое окно, отказ DWM) заменяется нулём: тогда
/// поведение остаётся прежним, а не ломается.
#[cfg(windows)]
fn visible_inset(window: &WebviewWindow, outer: Rect) -> Inset {
    use windows::Win32::Foundation::RECT;
    use windows::Win32::Graphics::Dwm::{DWMWA_EXTENDED_FRAME_BOUNDS, DwmGetWindowAttribute};

    /// Запас больше этого не встречается у обычного окна: даже на 200 %
    /// вставка равна 14-16 px.
    const MAX_INSET: i32 = 32;

    let Ok(hwnd) = window.hwnd() else {
        return Inset::default();
    };

    let mut rect = RECT::default();
    let length = std::mem::size_of::<RECT>() as u32;
    let result = unsafe {
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            std::ptr::from_mut(&mut rect).cast(),
            length,
        )
    };
    if result.is_err() {
        return Inset::default();
    }

    let inset = Inset {
        left: rect.left - outer.x,
        top: rect.top - outer.y,
        right: outer.x + outer.width as i32 - rect.right,
        bottom: outer.y + outer.height as i32 - rect.bottom,
    };

    let plausible = [inset.left, inset.top, inset.right, inset.bottom]
        .iter()
        .all(|value| (0..=MAX_INSET).contains(value));

    if plausible { inset } else { Inset::default() }
}

/// Вставка на других платформах не измеряется: окно выравнивается
/// по внешнему прямоугольнику.
#[cfg(not(windows))]
fn visible_inset(_window: &WebviewWindow, _outer: Rect) -> Inset {
    Inset::default()
}

/// Снимок текущей геометрии для записи в настройки.
///
/// Свёрнутое окно пропускается: у него нет осмысленных размера и места,
/// и запись затёрла бы ими прежние. У развёрнутого запоминается только флаг:
/// его размер равен рабочей области монитора, и записать его как обычный значило бы
/// развернуть окно при следующем запуске поверх всего.
///
/// Размер снимается с клиентской области, а положение — с внешнего угла:
/// так `set_size` и `set_position` при восстановлении получают те же числа,
/// что были сняты, и окно не съезжает с каждым запуском.
pub fn capture(window: &WebviewWindow) -> tauri::Result<Option<Value>> {
    if window.is_minimized()? {
        return Ok(None);
    }

    let maximized = window.is_maximized()?;
    let mut patch = Map::new();
    patch.insert("maximized".to_owned(), Value::Bool(maximized));

    if !maximized {
        let scale = normalize_scale(window.scale_factor()?);
        let inner = window.inner_size()?.to_logical::<f64>(scale);
        patch.insert(
            "width".to_owned(),
            Value::from(inner.width.round().max(1.0) as u32),
        );
        patch.insert(
            "height".to_owned(),
            Value::from(inner.height.round().max(1.0) as u32),
        );

        let position = window.outer_position()?;
        patch.insert("x".to_owned(), Value::from(position.x));
        patch.insert("y".to_owned(), Value::from(position.y));
    }

    Ok(Some(Value::Object(patch)))
}

/// Отложенная запись геометрии.
///
/// События окна только взводят таймер: запись происходит, когда окно
/// постояло на месте [`DEBOUNCE_MS`]. При закрытии и выходе таймер
/// сбрасывается принудительно — иначе последнее движение терялось бы.
///
/// Снимок окна снимается **в потоке событий** и здесь лишь хранится.
/// Геттеры окна (`is_minimized`, `inner_size`, …) отвечает поток событий,
/// поэтому снимок из фонового потока повисает, если этот поток занят
/// ожиданием записи. Проверено на живом окне: снимок внутри фоновой записи
/// подвешивал приложение на закрытии — `CloseRequested` ждал записи, запись
/// ждала ответа потока событий.
pub struct GeometrySaver {
    signal: mpsc::Sender<Signal>,
    /// Последний снятый снимок; `None` — записывать нечего.
    latest: Arc<Mutex<Option<Value>>>,
    worker: Mutex<Option<JoinHandle<()>>>,
}

/// Что делать потоку записи.
enum Signal {
    /// Геометрия изменилась: (пере)взвести таймер.
    Changed,
    /// Сохранить немедленно и завершиться.
    Flush,
}

impl GeometrySaver {
    /// Запускает фоновую запись. `save` вызывается в фоновом потоке, чтобы
    /// перетаскивание окна не ждало файловых операций.
    pub fn spawn(save: impl Fn(Value) + Send + 'static) -> Arc<Self> {
        let (signal, receiver) = mpsc::channel();
        let latest: Arc<Mutex<Option<Value>>> = Arc::new(Mutex::new(None));
        let worker = std::thread::Builder::new()
            .name("window-geometry".to_owned())
            .spawn({
                let latest = Arc::clone(&latest);
                move || run(receiver, latest, save)
            })
            .expect("поток сохранения геометрии");

        Arc::new(Self {
            signal,
            latest,
            worker: Mutex::new(Some(worker)),
        })
    }

    /// Запоминает снимок и (пере)взводит таймер записи.
    ///
    /// Снимок заменяет предыдущий: пользователю нужна последняя геометрия
    /// окна, а не история его движений.
    pub fn store(&self, patch: Value) {
        *self.latest.lock().expect("geometry lock") = Some(patch);
        // Отказ означает, что поток уже завершился: записывать больше некому.
        let _ = self.signal.send(Signal::Changed);
    }

    /// Сохраняет последнее состояние немедленно и дожидается записи.
    ///
    /// Ожидание важно при закрытии: без него процесс может завершиться
    /// раньше, чем файл дописан.
    pub fn flush(&self) -> AppResult<()> {
        let _ = self.signal.send(Signal::Flush);

        let worker = self.worker.lock().expect("geometry lock").take();
        match worker {
            Some(worker) => worker.join().map_err(|_| {
                AppError::new(
                    "errors.window.flush",
                    "Поток сохранения геометрии завершился с паникой",
                )
            }),
            // Повторный сброс: поток уже записал всё и завершился.
            None => Ok(()),
        }
    }
}

impl Drop for GeometrySaver {
    /// Страховка на случай выхода без явного `flush`: последняя геометрия
    /// ценнее, чем несколько миллисекунд ожидания.
    fn drop(&mut self) {
        let _ = self.signal.send(Signal::Flush);
        if let Ok(mut guard) = self.worker.lock()
            && let Some(worker) = guard.take()
        {
            let _ = worker.join();
        }
    }
}

/// Тело фонового потока: копит события и сохраняет по тишине.
fn run(receiver: mpsc::Receiver<Signal>, latest: Arc<Mutex<Option<Value>>>, save: impl Fn(Value)) {
    loop {
        match receiver.recv() {
            Ok(Signal::Changed) => {}
            Ok(Signal::Flush) => {
                persist(&latest, &save);
                return;
            }
            Err(_) => return,
        }

        // Внутренний цикл ждёт тишины: каждое новое событие отодвигает запись.
        loop {
            match receiver.recv_timeout(Duration::from_millis(DEBOUNCE_MS)) {
                Ok(Signal::Changed) => {}
                Ok(Signal::Flush) => {
                    persist(&latest, &save);
                    return;
                }
                Err(RecvTimeoutError::Timeout) => break,
                Err(RecvTimeoutError::Disconnected) => return,
            }
        }

        persist(&latest, &save);
    }
}

/// Записывает последний снимок, если он ещё не записан.
///
/// Снимок забирается, а не копируется: повторный `flush` (закрытие окна,
/// затем выход) не должен писать тот же файл второй раз.
fn persist(latest: &Mutex<Option<Value>>, save: &impl Fn(Value)) {
    let patch = latest.lock().expect("geometry lock").take();
    if let Some(patch) = patch {
        save(patch);
    }
}

fn screens(window: &WebviewWindow) -> tauri::Result<Vec<Screen>> {
    Ok(window
        .available_monitors()?
        .iter()
        .map(Screen::from_monitor)
        .collect())
}

#[cfg(test)]
mod tests {
    //! Проверки касаются прижатия к экрану: ошибка здесь делает окно
    //! недоступным, и пользователь не может ни работать, ни исправить это
    //! из интерфейса. Разбор живого окна проверяется запуском приложения.

    use super::*;

    fn screen(x: i32, y: i32, width: u32, height: u32) -> Screen {
        Screen {
            work_area: Rect {
                x,
                y,
                width,
                height,
            },
            scale_factor: 1.0,
        }
    }

    fn saved(width: u32, height: u32, x: Option<i32>, y: Option<i32>) -> WindowSettings {
        WindowSettings {
            width,
            height,
            x,
            y,
            ..WindowSettings::default()
        }
    }

    /// Рамка измеренного окна этой машины: 16 px по ширине, 39 px по высоте.
    fn measured_frame() -> Frame {
        Frame {
            width: 16,
            height: 39,
        }
    }

    #[test]
    fn first_run_keeps_size_and_leaves_place_to_system() {
        let placement = fit(
            &saved(1280, 800, None, None),
            &[screen(0, 0, 1920, 1040)],
            None,
            Frame::default(),
            Inset::default(),
        );

        assert_eq!(placement.width, 1280.0);
        assert_eq!(placement.height, 800.0);
        assert_eq!(placement.x, None);
        assert_eq!(placement.y, None);
    }

    #[test]
    fn tiny_saved_size_is_raised_to_minimum() {
        let placement = fit(
            &saved(600, 400, None, None),
            &[screen(0, 0, 1920, 1040)],
            None,
            Frame::default(),
            Inset::default(),
        );

        assert_eq!(placement.width, f64::from(MIN_WIDTH));
        assert_eq!(placement.height, f64::from(MIN_HEIGHT));
    }

    #[test]
    fn position_inside_work_area_is_kept() {
        let placement = fit(
            &saved(1280, 800, Some(100), Some(80)),
            &[screen(0, 0, 1920, 1040)],
            None,
            Frame::default(),
            Inset::default(),
        );

        assert_eq!(placement.x, Some(100));
        assert_eq!(placement.y, Some(80));
        assert_eq!(placement.width, 1280.0);
    }

    #[test]
    fn oversized_window_is_shrunk_to_work_area() {
        let placement = fit(
            &saved(2560, 1440, Some(0), Some(0)),
            &[screen(0, 0, 1920, 1040)],
            None,
            Frame::default(),
            Inset::default(),
        );

        assert_eq!(placement.width, 1920.0);
        assert_eq!(placement.height, 1040.0);
        assert_eq!(placement.x, Some(0));
        assert_eq!(placement.y, Some(0));
    }

    #[test]
    fn window_is_pulled_back_inside_work_area() {
        let placement = fit(
            &saved(1000, 700, Some(1900), Some(1000)),
            &[screen(0, 0, 1920, 1040)],
            None,
            Frame::default(),
            Inset::default(),
        );

        assert_eq!(placement.x, Some(920));
        assert_eq!(placement.y, Some(340));
    }

    #[test]
    fn window_frame_leaves_room_for_the_whole_window() {
        // Окно целиком — клиентская область плюс рамка. Без её учёта
        // окно свисало бы под рабочую область монитора на высоту заголовка.
        let placement = fit(
            &saved(2560, 1440, Some(0), Some(0)),
            &[screen(0, 0, 1920, 1040)],
            None,
            measured_frame(),
            Inset::default(),
        );

        assert_eq!(placement.width, 1904.0);
        assert_eq!(placement.height, 1001.0);
        assert_eq!(placement.x, Some(0));
        assert_eq!(placement.y, Some(0));
    }

    #[test]
    fn negative_coordinates_on_left_monitor_are_valid() {
        let screens = [screen(0, 0, 1920, 1040), screen(-1920, 0, 1920, 1040)];

        let placement = fit(
            &saved(800, 600, Some(-1800), Some(50)),
            &screens,
            None,
            Frame::default(),
            Inset::default(),
        );

        assert_eq!(placement.x, Some(-1800));
        assert_eq!(placement.y, Some(50));
    }

    #[test]
    fn position_from_disconnected_monitor_moves_to_current() {
        let current = screen(0, 0, 1920, 1040);

        let placement = fit(
            &saved(1000, 700, Some(3000), Some(200)),
            &[current],
            Some(&current),
            Frame::default(),
            Inset::default(),
        );

        assert_eq!(placement.x, Some(920));
        assert_eq!(placement.y, Some(200));
    }

    #[test]
    fn position_without_any_monitor_is_dropped() {
        // Мониторов не видно: гадать о месте не о чем, размер остаётся.
        let placement = fit(
            &saved(1280, 800, Some(3000), Some(200)),
            &[],
            None,
            Frame::default(),
            Inset::default(),
        );

        assert_eq!(placement.x, None);
        assert_eq!(placement.width, 1280.0);
    }

    #[test]
    fn scale_factor_participates_in_clamping() {
        // Экран 1920×1040 при масштабе 150 %: окно 1280×800 занимает
        // физические 1920×1200 и по высоте не помещается.
        let mut scaled = screen(0, 0, 1920, 1040);
        scaled.scale_factor = 1.5;

        let placement = fit(
            &saved(1280, 800, Some(0), Some(0)),
            &[scaled],
            None,
            Frame::default(),
            Inset::default(),
        );

        assert_eq!(placement.width, 1280.0);
        assert_eq!(placement.height, 693.0);
        assert_eq!(placement.x, Some(0));
        assert_eq!(placement.y, Some(0));
    }

    /// Рабочая область основного монитора: 1920×1040, панель задач снизу.
    fn work_area() -> Rect {
        Rect {
            x: 0,
            y: 0,
            width: 1920,
            height: 1040,
        }
    }

    fn window_at(x: i32, y: i32) -> Rect {
        Rect {
            x,
            y,
            width: 1000,
            height: 700,
        }
    }

    #[test]
    fn window_in_the_band_is_pulled_flush() {
        // Вариации одного поведения: окно движется к краю и оказывается ближе
        // порога, поэтому встаёт вплотную. Слева, справа, сверху, снизу,
        // в углу и с выходом за край; 1920 - 1000 = 920, 1040 - 700 = 340.
        let cases = [
            ((300, 200), (5, 200), (0, 200)),
            ((300, 200), (6, 200), (0, 200)),
            ((30, 200), (-4, 200), (0, 200)),
            ((500, 200), (915, 200), (920, 200)),
            ((300, 300), (300, 5), (300, 0)),
            ((300, 200), (300, 334), (300, 340)),
            ((300, 300), (6, 6), (0, 0)),
        ];

        for (from, to, expected) in cases {
            let mut tracker = SnapTracker::default();
            assert_eq!(
                pull(&mut tracker, from, to, 6),
                Some(window_at(expected.0, expected.1)),
                "из {from:?} в {to:?}"
            );
        }
    }

    #[test]
    fn window_outside_the_band_keeps_place() {
        // Вдали от краёв, на пиксель дальше порога и при проскоке за порог
        // магнит не срабатывает.
        let cases = [
            ((300, 200), (300, 200)),
            ((300, 200), (7, 200)),
            ((300, 200), (300, 347)),
            ((300, 200), (-20, 200)),
        ];

        for (from, to) in cases {
            let mut tracker = SnapTracker::default();
            assert_eq!(
                pull(&mut tracker, from, to, 6),
                None,
                "из {from:?} в {to:?}"
            );
        }
    }

    #[test]
    fn moving_away_from_the_edge_keeps_the_window_free() {
        let mut tracker = SnapTracker::default();

        // Быстрый подход: окно оказалось в двух пикселях от края.
        assert_eq!(
            pull(&mut tracker, (300, 200), (2, 200), 6),
            Some(window_at(0, 200))
        );

        // Собственный перенос окна приходит эхом и не считается движением.
        assert_eq!(
            tracker.snap(window_at(0, 200), work_area(), Inset::default(), 6),
            None
        );

        // Первый шаг от края, ещё внутри порога, отпускает окно сразу.
        assert_eq!(
            tracker.snap(window_at(3, 200), work_area(), Inset::default(), 6),
            None
        );

        // Обратный подход снова притягивает.
        assert_eq!(
            tracker.snap(window_at(2, 200), work_area(), Inset::default(), 6),
            Some(window_at(0, 200))
        );
    }

    #[test]
    fn window_snapped_at_threshold_releases_on_first_step() {
        let inset = Inset {
            left: 7,
            top: 0,
            right: 7,
            bottom: 7,
        };

        // Видимая граница окна в шести пикселях от края: магнит притягивает
        // его вплотную, внешний прямоугольник встаёт на вставку за край.
        let mut tracker = SnapTracker::default();
        assert_eq!(
            pull_inset(&mut tracker, (300, 200), (-1, 200), inset),
            Some(window_at(-7, 200))
        );

        // Собственный перенос окна приходит эхом и запоминается прошлой
        // позицией: иначе первое движение от края сравнивалось бы с местом
        // до прилипания.
        assert_eq!(
            tracker.snap(window_at(-7, 200), work_area(), inset, 6),
            None
        );

        // Один пиксель от края отпускает окно: свободного хода нет.
        assert_eq!(
            tracker.snap(window_at(-6, 200), work_area(), inset, 6),
            None
        );
    }

    #[test]
    fn resizing_does_not_snap() {
        let mut tracker = SnapTracker::default();
        assert_eq!(
            tracker.snap(window_at(300, 200), work_area(), Inset::default(), 6),
            None
        );

        // Изменение размера у левого края: окно уже в трёх пикселях, но это
        // не перетаскивание, и магнит молчит.
        let mut resized = window_at(3, 200);
        resized.width = 1200;
        assert_eq!(
            tracker.snap(resized, work_area(), Inset::default(), 6),
            None
        );
    }

    #[test]
    fn inset_targets_the_visible_border() {
        let inset = Inset {
            left: 7,
            top: 0,
            right: 7,
            bottom: 7,
        };

        // Видимая граница окна в трёх пикселях от края: внешний прямоугольник
        // встаёт за рабочую область на вставку.
        let mut left = SnapTracker::default();
        assert_eq!(
            pull_inset(&mut left, (300, 200), (-4, 200), inset),
            Some(window_at(-7, 200))
        );

        // 1040 - 700 + 7: низ видимой границы совпадает с верхом панели задач.
        let mut bottom = SnapTracker::default();
        assert_eq!(
            pull_inset(&mut bottom, (300, 200), (300, 345), inset),
            Some(window_at(300, 347))
        );
    }

    #[test]
    fn taskbar_on_top_moves_the_top_edge_down() {
        let area = Rect {
            x: 0,
            y: 40,
            width: 1920,
            height: 1000,
        };

        let mut tracker = SnapTracker::default();
        tracker.snap(window_at(300, 200), area, Inset::default(), 6);
        assert_eq!(
            tracker.snap(window_at(300, 44), area, Inset::default(), 6),
            Some(window_at(300, 40))
        );
    }

    #[test]
    fn window_larger_than_the_area_is_not_aligned_on_that_axis() {
        let narrow = Rect {
            x: 0,
            y: 0,
            width: 900,
            height: 1040,
        };

        // Окно шире рабочей области: горизонтальную ось прижать к обоим краям
        // нельзя, поэтому она пропускается, даже когда край рядом.
        let wide = |x: i32| Rect {
            x,
            y: 200,
            width: 1000,
            height: 1000,
        };
        let mut wider = SnapTracker::default();
        assert_eq!(wider.snap(wide(10), narrow, Inset::default(), 6), None);
        assert_eq!(wider.snap(wide(3), narrow, Inset::default(), 6), None);

        // То же по вертикали: окно выше рабочей области.
        let short = Rect {
            x: 0,
            y: 0,
            width: 1920,
            height: 600,
        };
        let tall = |y: i32| Rect {
            x: 300,
            y,
            width: 1000,
            height: 700,
        };
        let mut taller = SnapTracker::default();
        assert_eq!(taller.snap(tall(10), short, Inset::default(), 6), None);
        assert_eq!(taller.snap(tall(4), short, Inset::default(), 6), None);
    }

    /// Два события перетаскивания: окно было в `from`, стало в `to`.
    fn pull(
        tracker: &mut SnapTracker,
        from: (i32, i32),
        to: (i32, i32),
        threshold: i32,
    ) -> Option<Rect> {
        tracker.snap(
            window_at(from.0, from.1),
            work_area(),
            Inset::default(),
            threshold,
        );
        tracker.snap(
            window_at(to.0, to.1),
            work_area(),
            Inset::default(),
            threshold,
        )
    }

    /// То же со вставкой видимой границы.
    fn pull_inset(
        tracker: &mut SnapTracker,
        from: (i32, i32),
        to: (i32, i32),
        inset: Inset,
    ) -> Option<Rect> {
        tracker.snap(window_at(from.0, from.1), work_area(), inset, 6);
        tracker.snap(window_at(to.0, to.1), work_area(), inset, 6)
    }

    /// Вставка снизу, измеренная на этой машине: 7 px невидимой рамки.
    fn measured_inset() -> Inset {
        Inset {
            left: 0,
            top: 0,
            right: 0,
            bottom: 7,
        }
    }

    #[test]
    fn snapped_position_survives_restore() {
        // Окно прилипло к верхнему краю панели задач: внешний прямоугольник
        // выступает за рабочую область на вставку, а видимая граница
        // совпадает с ней. Восстановление не должно поднимать окно.
        let placement = fit(
            &saved(1280, 800, Some(0), Some(208)),
            &[screen(0, 0, 1920, 1040)],
            None,
            measured_frame(),
            measured_inset(),
        );

        assert_eq!(placement.x, Some(0));
        assert_eq!(placement.y, Some(208));
    }

    #[test]
    fn visible_border_does_not_leave_the_work_area() {
        let placement = fit(
            &saved(1280, 800, Some(0), Some(1039)),
            &[screen(0, 0, 1920, 1040)],
            None,
            measured_frame(),
            measured_inset(),
        );

        assert_eq!(placement.y, Some(208));
    }

    #[test]
    fn inset_gives_room_to_an_oversized_window() {
        let inset = Inset {
            left: 7,
            top: 0,
            right: 7,
            bottom: 7,
        };

        let placement = fit(
            &saved(2560, 1440, Some(0), Some(0)),
            &[screen(0, 0, 1920, 1040)],
            None,
            measured_frame(),
            inset,
        );

        assert_eq!(placement.width, 1918.0);
        assert_eq!(placement.height, 1008.0);
        assert_eq!(placement.x, Some(-7));
        assert_eq!(placement.y, Some(0));
    }

    #[test]
    fn window_snapped_on_a_second_monitor_stays_there() {
        // Окно прилипло к левому краю левого монитора: внешний угол
        // на вставку за рабочей областью. При восстановлении оно не должно
        // переехать на основной монитор.
        let screens = [screen(0, 0, 1920, 1040), screen(-1920, 0, 1920, 1040)];
        let primary = screen(0, 0, 1920, 1040);
        let inset = Inset {
            left: 7,
            top: 0,
            right: 7,
            bottom: 7,
        };

        let placement = fit(
            &saved(1000, 700, Some(-1927), Some(100)),
            &screens,
            Some(&primary),
            measured_frame(),
            inset,
        );

        assert_eq!(placement.x, Some(-1927));
        assert_eq!(placement.y, Some(100));
    }
}

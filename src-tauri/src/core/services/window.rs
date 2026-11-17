//! Геометрия окна: восстановление, прижатие к экрану и сохранение (ADR 0011).
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

/// Подбирает геометрию, прижатую к рабочей области монитора.
///
/// Логика в три шага: найти монитор под сохранённой точкой (иначе текущий),
/// перевести размер в его физические пиксели и прижать внешний прямоугольник
/// окна внутрь рабочей области монитора. Размер уменьшается только если окно
/// физически больше экрана; положение сдвигается всегда, чтобы окно осталось
/// достижимым.
pub fn fit(
    saved: &WindowSettings,
    screens: &[Screen],
    current: Option<&Screen>,
    frame: Frame,
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
    let screen = screens
        .iter()
        .find(|screen| screen.work_area.contains(x, y))
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
    // область — это рабочая область монитора минус рамка.
    let available_width = f64::from(area.width.saturating_sub(frame.width).max(1));
    let available_height = f64::from(area.height.saturating_sub(frame.height).max(1));

    let physical_width = (f64::from(width) * scale).round();
    let physical_height = (f64::from(height) * scale).round();
    let clamped_width = physical_width.min(available_width);
    let clamped_height = physical_height.min(available_height);

    let outer_width = clamped_width + f64::from(frame.width);
    let outer_height = clamped_height + f64::from(frame.height);

    // Нижняя граница прижатия — не меньше рабочей области монитора: при окне шире
    // экрана правый край совпадает с её краем, а не уходит в минус.
    let left = x.clamp(area.x, area.right() - outer_width as i32);
    let top = y.clamp(area.y, area.bottom() - outer_height as i32);

    Placement {
        width: (clamped_width / scale).round(),
        height: (clamped_height / scale).round(),
        x: Some(left),
        y: Some(top),
    }
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
    let placement = fit(saved, &screens, current.as_ref(), frame);

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
        );

        assert_eq!(placement.width, 1280.0);
        assert_eq!(placement.height, 693.0);
        assert_eq!(placement.x, Some(0));
        assert_eq!(placement.y, Some(0));
    }
}

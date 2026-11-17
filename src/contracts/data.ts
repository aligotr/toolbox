// Контракт раздела «Данные»: размеры папок и данные инструментов.
//
// Ядро считает файлы и байты, интерфейс только показывает числа. Разбивка
// по инструментам нужна, чтобы удалять данные точечно: `profiles/<id>/data/`
// принадлежит профилю, а внутри каждая подсистема ведёт свою папку (ADR 0010).

/** Сколько файлов и байт занято. */
export interface DirStats {
  files: number;
  bytes: number;
}

/** Данные одного инструмента: папка `data/<id>/`. */
export interface ToolStats {
  id: string;
  files: number;
  bytes: number;
}

/** Размеры логов и данных инструментов активного профиля. */
export interface StorageStats {
  logs: DirStats;
  tools: ToolStats[];
}

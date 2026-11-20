# Оптимизация изображений

Скрипт `images-optimizer.ts` оптимизирует изображения для web, сохраняя исходные размеры.
Исходные типы файлов: `.png`, `.jpg` и `.jpeg`.
Результирующие типы файлов: `png`, `webp` и `avif`.

Выбор исходного изображения / папки:

- Файл: `npm run images:optimize -- public/images/etc/logo.png`
  Результат: public/images/etc/logo.webp
- Папка: `npm run images:optimize -- public/images/etc`
  Результат: public/images/etc/\*.webp

Параметры запуска:

- Изменить качество сжатия: `npm run images:optimize -- public/images/etc --quality=90`
- Создать WebP и AVIF: `npm run images:optimize -- public/images/etc --formats=webp,avif`
- Создать оптимизированный PNG: `npm run images:optimize -- public/images/etc/logo.png --formats=png`
- Перезапись существующих конечных файлов: `npm run images:optimize -- public/images/etc --overwrite=true`

## Принципы работы

По умолчанию существующие результаты пропускаются.
Параметр `--overwrite=true` разрешает перезапись обычных конечных файлов, но
никогда не перезаписывает файлы `src_*`.

Если выходной формат совпадает с исходным, исходник сначала переименовывается
с префиксом `src_`: `logo.png` становится `src_logo.png`, а оптимизированный
файл записывается как `logo.png`. При наличии такого резервного файла формат
пропускается с сообщением, а обработка остальных изображений продолжается.

При совпадении конечных имён, например для `logo.png` и `logo.jpg`, оба
конфликтующих результата пропускаются.

При ошибке оптимизации исходный файл сохраняется. Временные файлы удаляются
после завершения операции.

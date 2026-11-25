# Старт нового проекта

Пособие для инициализации памяти проекта в стиле этого репозитория. Оно не
правило: после настройки остаётся памяткой.

## Что скопировать

```text
AGENTS.md

.agents/rules/global/
  memory.md
  tasks.md
  library.md
  git.md
  priorities.md
  code-style.md
  tests.md
  quality.md
  agents-guard.yml

.agents/auxiliary/
  README.md
  bootstrap.md
  examples/
    project-memory.html
  templates/
    adr.md
    spec.md
    task.md
    library-page.md
    decisions-index.md
    specs-readme.md
    library-readme.md
    glossary-index.md
    adr-0001-memory.md
    project-quality.md
    project-agents-guard.yml
    project-architecture.md
  scripts/
    README.md
    conformance.mjs
    node/
      manifest.json
      check-docs.mjs
      build-adr-index.mjs

.agents/glossary/
  README.md
```

`auxiliary/scripts/` - необязательная часть и универсальный набор: копируется
целиком, реализации на разных языках лежат рядом. Скрипты подключаются, если
проект готов их запускать; без них указатель ADR ведётся вручную.

`auxiliary/examples/project-memory.html` - образец визуальной карты памяти.
В новом проекте его заменяют своей картой или удаляют.

## Что создать из шаблонов

```text
.agents/decisions/INDEX.md          <- templates/decisions-index.md
.agents/decisions/0001-project-memory.md <- templates/adr-0001-memory.md
.agents/specs/README.md             <- templates/specs-readme.md
.agents/library/README.md           <- templates/library-readme.md
.agents/GLOSSARY.md                 <- templates/glossary-index.md
.agents/rules/project/quality.md    <- templates/project-quality.md
.agents/rules/project/agents-guard.yml <- templates/project-agents-guard.yml
.agents/rules/project/architecture.md  <- templates/project-architecture.md
```

## Что не переносить

- ADR, спеки и архив: это решения и поведение другого проекта.
- Термины глоссария и страницы библиотеки.
- `rules/project/*` целиком: команды, слои и стек у нового проекта свои.
- `.agents/skills/`: ставится установщиком.
- `.agents/mcp/`: подключается отдельно под нужные библиотеки.
- `.scratch/`: временная книжка, она не коммитится.

Если стек совпадает, `vue.md`, `rust.md`, `i18n.md` и `ui/*` можно взять как
основу, но пути, команды и примеры придётся переписать.

## Настройка корня

- `.gitignore`: добавить `/.scratch/`.
- `.prettierignore`: добавить `.agents/` и `.scratch/`.
- ESLint: игнорировать `.agents/**` и `.scratch/**`.
- `scripts/` в корне: скрипты проекта, не относящиеся к `.agents`
  и документации. Из этого репозитория не копируются.
- `package.json`: для текущего набора на Node, если в проекте есть npm,
  добавить команды:

```json
"docs:check": "node .agents/auxiliary/scripts/node/check-docs.mjs",
"docs:index": "node .agents/auxiliary/scripts/node/build-adr-index.mjs",
"docs:conformance": "node .agents/auxiliary/scripts/conformance.mjs"
```

Проверки документации необязательны: набор подключается, если проект готов
его запускать. Текущая реализация написана на Node; другие языки добавляются
рядом по общему контракту. Если набор не подключён, указатель ADR ведётся
вручную, ссылки и пути проверяются перед коммитом. Проверки кода при этом
остаются за раннером проекта.

## Первый запуск

1. Скопировать global-правила, auxiliary с шаблонами и, если нужны, скриптами,
   глоссарий.
2. Создать `AGENTS.md` и проверить defaults: тип проекта, схема версий,
   путь к `quality.md`. Если `AGENTS.md` уже есть, перенести разделы, а не
   перезаписывать файл.
3. Создать `decisions/INDEX.md` и `0001-project-memory.md`. Заполнить дату.
4. Создать `specs/README.md`: пока без спек.
5. Создать `library/README.md`: области перечислены, папки появятся с первыми
   страницами.
6. Создать `GLOSSARY.md` из шаблона; `glossary/README.md` уже скопирован.
   Добавить первые термины.
7. Заполнить `rules/project/quality.md`, `agents-guard.yml`, `architecture.md`
   под стек.
8. Настроить `.gitignore`, `.prettierignore` и ESLint.
9. Если подключены скрипты документации, пересобрать указатель и прогнать
   проверку. Для текущего набора на Node:

```powershell
npm run docs:index
npm run docs:check
npm run docs:conformance
```

Если скрипты не подключены, указатель ADR ведётся вручную, а ссылки и пути
проверяются перед коммитом. Проверки кода выполняет раннер проекта.

10. Первый коммит: память пустая, но правила, шаблоны и проверки работают.

## Что заполнить в project-правилах

- `quality.md` - команды по уровням проверок, матрица областей и живая
  проверка; объём и момент задаёт `../../global/quality.md`.
- `agents-guard.yml` - разрешённые команды, запреты и проверки перед коммитом.
- `architecture.md` - слои, зоны, данные, удаление и стражи границ.
- `<стек>.md` - правила языка или фреймворка, если они нужны.

## Признак готовности

- Проверка документации проходит, если она подключена.
- Сверка реализаций проходит, если их больше одной.
- Проверки проекта по матрице проходят на выбранном раннере.
- `AGENTS.md` читается глазами: без таблицы памяти и без чужих примеров.
- В `decisions/` есть только свои ADR.
- В `GLOSSARY.md` нет чужих терминов.
- В `library/` нет чужих элементов.

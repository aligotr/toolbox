# Инструкции для агентов

## Память проекта

Перед архитектурными изменениями прочитай:

- `.agents/README.md` — правила ведения записей;
- `.agents/decisions/` — принятые решения (ADR). Их не переписывают: новое
  решение оформляется отдельным файлом;
- `.agents/GLOSSARY.md` — термины проекта. Используй их в коде, топиках и
  обсуждении.

Новое архитектурное решение фиксируй в `.agents/decisions/` по шаблону из
`.agents/README.md`.

## Проект

Корень проекта — эта папка (`toolbox`). Десктопное приложение: Rust + Tauri 2
(ядро, шина сообщений) и Vue 3 + TypeScript (интерфейс). Подсистемы
подключаются через шину сообщений, а не прямыми вызовами.

Проверки перед завершением задачи:

```powershell
npm run build
Set-Location src-tauri
cargo check
cargo test --lib
```

## Agent skills

### Issue tracker

Задачи живут markdown-файлами в `.scratch/<фича>/`. См. `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: глоссарий — `.agents/GLOSSARY.md`, решения — `.agents/decisions/`.
См. `docs/agents/domain.md`.

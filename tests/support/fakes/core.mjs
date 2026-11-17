// Фейк команд Tauri: ядро заменяется обработчиком, который задаёт тест.
//
// `invoke` в приложении — единственный путь к Rust. Тест подставляет
// обработчик команды и проверяет, что ядро интерфейса собрало правильный
// вызов и правильно разобрало ответ.

/** Обработчик по умолчанию: команда без ответа. */
let handler = async () => null;

/** Журнал вызовов: команда и аргументы, в порядке обращения. */
export const calls = [];

/** Заменяет обработчик команд; `null` возвращает пустой ответ. */
export function setInvokeHandler(next) {
  handler = next ?? (async () => null);
  calls.length = 0;
}

/** Вызов команды: имя и аргументы уходят обработчику. */
export async function invoke(command, args) {
  calls.push({ command, args });
  return handler(command, args);
}

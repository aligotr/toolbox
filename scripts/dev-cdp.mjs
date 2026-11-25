// Запуск приложения с открытым отладочным портом WebView2.
//
// WebView2 читает дополнительные аргументы браузера из переменной окружения
// WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS. Порт задаётся переменной CDP_PORT,
// по умолчанию 9222. Порт открыт только на локальной машине и только в
// dev-сборке: в конфигурацию сборки его не добавляют.

import { spawn } from "node:child_process";

const port = process.env.CDP_PORT ?? "9222";
const extra = process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS ?? "";
const env = {
  ...process.env,
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `${extra} --remote-debugging-port=${port}`.trim(),
};

const command = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(command, ["run", "tauri", "dev"], {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});

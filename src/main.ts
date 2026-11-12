import { invoke } from "@tauri-apps/api/core";
import { createApp } from "vue";
import App from "./App.vue";
import "./styles/global.css";

// Ошибки интерфейса идут в тот же файловый лог, что и отказы Rust.
//
// Иначе они не оставляют следа вообще: консоли в релизной сборке нет,
// а пользователь видит только «ничего не произошло» (ADR 0004).
// Ошибку самой отправки не повторяем — иначе получилась бы рекурсия.
function reportToLog(message: string): void {
  void invoke("log_frontend", { level: "error", message }).catch(() => {});
}

window.addEventListener("error", (event) => {
  reportToLog(`${event.message} (${event.filename}:${event.lineno}:${event.colno})`);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason =
    event.reason instanceof Error
      ? `${event.reason.name}: ${event.reason.message}`
      : String(event.reason);
  reportToLog(`необработанный reject: ${reason}`);
});

const app = createApp(App);

app.config.errorHandler = (error, _instance, info) => {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  reportToLog(`ошибка Vue (${info}): ${text}`);
};

app.mount("#app");

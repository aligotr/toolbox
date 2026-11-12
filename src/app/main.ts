import { invoke } from "@tauri-apps/api/core";
import { createApp } from "vue";
import PrimeVue from "primevue/config";
import ConfirmationService from "primevue/confirmationservice";
import Tooltip from "primevue/tooltip";
import "primeicons/primeicons.css";
import App from "./App.vue";
import { toolboxPreset } from "../ui/theme";
import "../styles/global.css";

// Ошибки интерфейса идут в тот же файловый лог, что и отказы Rust.
//
// Иначе они не оставляют следа вообще: консоли в релизной сборке нет,
// а пользователь видит только «ничего не произошло» (ADR 0004).
// Ошибку самой отправки не повторяем — иначе получилась бы рекурсия.
function reportToLog(message: string): void {
  void invoke("log_frontend", { message }).catch(() => {});
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

// Тёмная схема включается классом, а не системной настройкой: приложение
// всегда тёмное, и `prefers-color-scheme` не должен менять его вид.
document.documentElement.classList.add("dark");

const app = createApp(App);

app.use(PrimeVue, {
  ripple: true,
  theme: {
    preset: toolboxPreset,
    options: {
      darkModeSelector: ".dark",
      cssLayer: false,
    },
  },
});

// Подсказки рейла и кнопок полосы вкладок — один общий механизм PrimeVue.
app.directive("tooltip", Tooltip);

// Подтверждения переключения и удаления профилей: один диалог на всё
// приложение, текст задаётся в `shell/useProfiles.ts`.
app.use(ConfirmationService);

app.config.errorHandler = (error, _instance, info) => {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  reportToLog(`ошибка Vue (${info}): ${text}`);
};

app.mount("#app");

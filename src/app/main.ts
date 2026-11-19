import { invoke } from "@tauri-apps/api/core";
import { createApp } from "vue";
import PrimeVue from "primevue/config";
import ConfirmationService from "primevue/confirmationservice";
import ToastService from "primevue/toastservice";
import Tooltip from "primevue/tooltip";
import "primeicons/primeicons.css";
import App from "./App.vue";
import { setupLocale } from "./locales";
import { toolboxPreset } from "@/ui/primevue/theme";
import "@/styles/global.css";

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

// Схема одна — светлая (ADR 0019). Системная настройка и класс на `html`
// не должны менять вид: `darkModeSelector: false` отключает тёмные значения
// пресета целиком.
//
// Язык выбирается до монтирования: блокирующий экран и первый кадр должны
// быть уже переведены (ADR 0039).
await setupLocale();

const app = createApp(App);

app.use(PrimeVue, {
  ripple: true,
  theme: {
    preset: toolboxPreset,
    options: {
      darkModeSelector: false,
      cssLayer: false,
    },
  },
});

// Подсказки рейла и кнопок полосы вкладок — один общий механизм PrimeVue.
app.directive("tooltip", Tooltip);

// Подтверждения переключения и удаления профилей: один диалог на всё
// приложение, текст задаётся в настройках профилей.
app.use(ConfirmationService);

// Уведомления поверх экрана: один приёмник на всё приложение (ADR 0058).
app.use(ToastService);

app.config.errorHandler = (error, _instance, info) => {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  reportToLog(`ошибка Vue (${info}): ${text}`);
};

app.mount("#app");

// Список подсистем интерфейса.
//
// Порядок в меню задаётся полем `order`. Новая подсистема подключается здесь
// одной записью — оболочку и ядро трогать не нужно.

import type { UiModule } from "../core/modules";
import HomeView from "./home/HomeView.vue";
import TraceView from "./trace/TraceView.vue";

export const uiModules: UiModule[] = [
  {
    id: "home",
    title: "Главная",
    description: "Состояние ядра и самопроверка шины",
    icon: "◎",
    component: HomeView,
    order: 0,
  },
  {
    id: "trace",
    title: "Как работает шина",
    description: "Учебный прогон запроса с пояснением каждого этапа",
    icon: "⇄",
    component: TraceView,
    order: 10,
  },
];

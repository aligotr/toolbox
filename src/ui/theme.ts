// Тема приложения (ADR 0009).
//
// Всё визуальное — цвета, отступы, радиусы — задаётся одним пресетом
// PrimeVue. Экраны не переопределяют токены точечно: иначе тема расползлась
// бы по файлам и перестала быть единой.
//
// Приложение тёмное. Светлая схема Aura остаётся нетронутой: тёмные значения
// живут в `colorScheme.dark` и включаются классом `.dark` на `html`.
// База текста — 16 px; в PrimeVue 4 размеры шрифта компонентов заданы в их
// собственных стилях, поэтому шкала 28/18/15/14/13 применяется в разметке
// экранов, а пресет отвечает за цвета, отступы, радиусы и состояния.

import { definePreset } from "@primeuix/themes";
import Aura from "@primeuix/themes/aura";

/** Семейства шрифтов: интерфейс — гротеск, код — моноширинный. */
export const FONT_UI = '"Inter", "Segoe UI", system-ui, sans-serif';
export const FONT_MONO = '"Cascadia Code", "Consolas", monospace';

/**
 * Пресет ToolBox.
 *
 * Шкала `surface` подобрана под тёмную схему: `surface.900` — фон рабочей
 * области, `800` — поверхность панели, `600` — граница, `950` — фон полей.
 * Светлые ступени (0–400) достаются тексту и вторичным подписям.
 */
export const toolboxPreset = definePreset(Aura, {
  primitive: {
    borderRadius: {
      none: "0",
      xs: "4px",
      sm: "6px",
      md: "8px",
      lg: "12px",
      xl: "16px",
    },
  },
  semantic: {
    transitionDuration: "0.15s",
    disabledOpacity: "0.55",
    focusRing: {
      width: "2px",
      style: "solid",
      color: "{primary.color}",
      offset: "2px",
      shadow: "none",
    },
    primary: {
      50: "#eef3ff",
      100: "#dbe5ff",
      200: "#bed1ff",
      300: "#96b4ff",
      400: "#6f97ff",
      500: "#5b8cff",
      600: "#4a79e6",
      700: "#3a63c4",
      800: "#2e4f9e",
      900: "#263f7c",
      950: "#16224a",
    },
    // Отступы полей кратны 8: от них наследуются кнопки и списки.
    formField: {
      paddingX: "16px",
      paddingY: "8px",
      sm: {
        fontSize: "14px",
        paddingX: "12px",
        paddingY: "4px",
      },
      lg: {
        fontSize: "16px",
        paddingX: "20px",
        paddingY: "12px",
      },
    },
    colorScheme: {
      dark: {
        surface: {
          0: "#f7f9fc",
          50: "#eef1f6",
          100: "#e2e6ee",
          200: "#cdd3df",
          300: "#aeb6c6",
          400: "#8791a5",
          500: "#3a4150",
          600: "#2a2f3a",
          700: "#1e222b",
          800: "#181b22",
          900: "#111318",
          950: "#0d0f13",
        },
        primary: {
          color: "#5b8cff",
          contrastColor: "#0b1020",
          hoverColor: "#7aa1ff",
          activeColor: "#4a79e6",
        },
        text: {
          color: "#e7eaf0",
          hoverColor: "#f2f5fa",
          mutedColor: "#9aa3b2",
          hoverMutedColor: "#b4bccb",
        },
      },
    },
  },
});

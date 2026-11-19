// Тема приложения (ADR 0019).
//
// Один светлый пресет: схема не переключается, поэтому тёмных значений здесь
// нет. Всё визуальное — цвета, отступы, радиусы — задаётся этим файлом;
// экраны не переопределяют токены точечно, иначе тема расползлась бы
// по файлам и перестала быть единой.
//
// Вид — рабочий инструмент, а не витрина: тёплая бумажная подложка, белые
// панели, тонкие линии, почти монохромная типографика. Акцент тёмно-зелёный
// и появляется только там, где нужно действие или выбор; красный оставлен
// ошибкам. Корень — 16 px (технический: rem, масштаб, умолчание), основной
// текст — 14 px; шкала 24/18/15/14/13 применяется в разметке экранов, а
// пресет отвечает за цвета, отступы, радиусы, состояния и базовые размеры
// шрифтов компонентов PrimeVue.

import { definePreset } from "@primeuix/themes";
import Aura from "@primeuix/themes/aura";

/**
 * Пресет ToolBox.
 *
 * `surface.0` — панели, `50` — подложка блоков, `100` — наведение,
 * `200` — линии, `300` — усиленная линия поля, `400–600` — вторичный текст,
 * `800` — основной текст. Тёмные ступени нужны только редким акцентам.
 */
export const toolboxPreset = definePreset(Aura, {
  primitive: {
    borderRadius: {
      none: "0",
      xs: "4px",
      sm: "6px",
      md: "8px",
      lg: "10px",
      xl: "14px",
    },
  },
  semantic: {
    transitionDuration: "0.12s",
    disabledOpacity: "0.5",
    focusRing: {
      width: "2px",
      style: "solid",
      color: "{primary.color}",
      offset: "2px",
      shadow: "none",
    },
    // Тёмно-зелёный акцент: тот же тон, что у знака ToolBox, без второго цвета.
    primary: {
      50: "#edf5f0",
      100: "#d6e9dd",
      200: "#aed3bc",
      300: "#7fb797",
      400: "#4f9772",
      500: "#265a41",
      600: "#1e4834",
      700: "#183a2a",
      800: "#122c20",
      900: "#0a1a13",
      950: "#06120c",
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
      light: {
        surface: {
          0: "#ffffff",
          50: "#fafaf8",
          100: "#f4f4f1",
          200: "#e7e5e2",
          300: "#d6d3cf",
          400: "#a8a29e",
          500: "#6b6560",
          600: "#57534e",
          700: "#44403c",
          800: "#292524",
          900: "#1c1917",
          950: "#0c0a09",
        },
        text: {
          color: "{surface.800}",
          hoverColor: "{surface.900}",
          mutedColor: "{surface.500}",
          hoverMutedColor: "{surface.600}",
        },
        content: {
          background: "{surface.0}",
          hoverBackground: "{surface.100}",
          borderColor: "{surface.200}",
          color: "{text.color}",
          hoverColor: "{text.hover.color}",
        },
        highlight: {
          background: "{primary.50}",
          focusBackground: "{primary.100}",
          color: "{primary.700}",
          focusColor: "{primary.800}",
        },
        formField: {
          background: "{surface.0}",
          disabledBackground: "{surface.100}",
          filledBackground: "{surface.50}",
          filledHoverBackground: "{surface.100}",
          filledFocusBackground: "{surface.0}",
          borderColor: "{surface.300}",
          hoverBorderColor: "{surface.400}",
          focusBorderColor: "{primary.color}",
          invalidBorderColor: "{red.700}",
          color: "{surface.800}",
          disabledColor: "{surface.400}",
          placeholderColor: "{surface.500}",
          invalidPlaceholderColor: "{red.700}",
          floatLabelColor: "{surface.500}",
          floatLabelFocusColor: "{primary.600}",
          floatLabelActiveColor: "{surface.500}",
          floatLabelInvalidColor: "{red.700}",
          iconColor: "{surface.500}",
          shadow: "none",
        },
        overlay: {
          select: {
            background: "{surface.0}",
            borderColor: "{surface.200}",
            color: "{text.color}",
          },
          popover: {
            background: "{surface.0}",
            borderColor: "{surface.200}",
            color: "{text.color}",
          },
          modal: {
            background: "{surface.0}",
            borderColor: "{surface.200}",
            color: "{text.color}",
          },
        },
        list: {
          option: {
            focusBackground: "{surface.100}",
            selectedBackground: "{primary.50}",
            selectedFocusBackground: "{primary.100}",
            color: "{text.color}",
            focusColor: "{text.hover.color}",
            selectedColor: "{primary.700}",
            selectedFocusColor: "{primary.800}",
            icon: {
              color: "{surface.400}",
              focusColor: "{surface.500}",
            },
          },
          optionGroup: {
            background: "transparent",
            color: "{text.muted.color}",
          },
        },
        navigation: {
          item: {
            focusBackground: "{surface.100}",
            activeBackground: "{surface.100}",
            color: "{text.color}",
            focusColor: "{text.hover.color}",
            activeColor: "{text.hover.color}",
            icon: {
              color: "{surface.400}",
              focusColor: "{surface.500}",
              activeColor: "{surface.500}",
            },
          },
          submenuLabel: {
            background: "transparent",
            color: "{text.muted.color}",
          },
          submenuIcon: {
            color: "{surface.400}",
            focusColor: "{surface.500}",
            activeColor: "{surface.500}",
          },
        },
        mask: {
          background: "rgba(28, 25, 23, 0.32)",
          color: "{surface.200}",
        },
      },
    },
  },
  // Заголовок диалога — ступень 18 px шкалы, а не ауровские 20 px.
  // Плотная таблица тоже стоит на сетке 8 px: ауровские 6 px сверху сбивают
  // вертикальный ритм строк с остальными блоками.
  components: {
    dialog: {
      title: {
        fontSize: "18px",
      },
    },
    datatable: {
      headerCell: {
        sm: {
          padding: "8px",
        },
      },
      bodyCell: {
        sm: {
          padding: "8px",
        },
      },
    },
    // Уведомление: ширина по тексту сообщения, общий радиус и линия темы.
    // Времена жизни и очередь задаёт приёмник (ADR 0058).
    toast: {
      root: {
        width: "24rem",
        borderRadius: "{border.radius.md}",
        borderWidth: "1px",
      },
      content: {
        padding: "12px 16px",
      },
      summary: {
        fontSize: "14px",
      },
      detail: {
        fontSize: "13px",
      },
    },
  },
  // База типографики PrimeVue: компоненты, которые не задают размер сами
  // (подсказки, меню, диалоги, оверлеи), наследуют корневые 16 px и выглядят
  // крупнее шкалы. Здесь им задан основной текст 14 px, подсказкам и чипам —
  // 13 px. `html` в селекторе поднимает вес над собственными правилами
  // компонентов (`1rem` у полей и кнопок): без этого корневые 16 px
  // перебивают базу.
  css: `
    html .p-component {
      font-size: 14px;
    }

    /* Поля, списки и кнопки одной высоты: соседние элементы в строке стоят
       на одной линии, а не расходятся на разницу высоты строки текста. */
    html .p-inputtext-sm,
    html .p-select-sm,
    html .p-multiselect-sm,
    html .p-button-sm {
      height: var(--ag-control-h);
    }

    html .p-tooltip,
    html .p-chip {
      font-size: 13px;
    }

    /* Подсказка не переносится сама: строки задаёт владелец, и каждая
       остаётся целой. Свёрнутый рейл добавляет название отдельной строкой. */
    html .p-tooltip {
      max-width: none;
    }

    html .p-tooltip-text {
      white-space: pre;
    }

    /* Подтверждения задают сообщение несколькими строками: перенос значим. */
    html .p-confirmdialog-message {
      white-space: pre-line;
    }

    /* Крестик диалога - иконочная кнопка действия, как и прочие: общий
       радиус вместо круга. Иначе и обводка фокуса очерчивает круг. */
    html .p-dialog-close-button.p-button-rounded {
      border-radius: var(--ag-radius-md);
    }

    /* При открытии фокус получает содержимое диалога, а не крестик. Это
       не действие, поэтому обводка контейнеру не рисуется: видимый
       focus-visible остаётся у полей и кнопок. */
    html .p-dialog-content > [autofocus]:focus {
      outline: none;
    }

    /* Всплывающее подтверждение: вопрос по центру, кнопки по центру блока.
       Минимальная ширина не даёт короткому вопросу сжаться до ширины кнопок. */
    html .p-confirmpopup {
      min-width: 260px;
    }

    html .p-confirmpopup-content {
      justify-content: center;
    }

    html .p-confirmpopup-message {
      text-align: center;
    }

    html .p-confirmpopup-footer {
      justify-content: center;
      gap: var(--ag-space-lg);
    }
  `,
});

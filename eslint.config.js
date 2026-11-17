// Статический анализ интерфейса: ESLint и совместимость с Prettier.
//
// Ловит то, чего не видит `vue-tsc`: неиспользуемые компоненты и переменные
// в шаблонах, забытые `await`, ошибки разметки. Стиль (отступы, кавычки,
// точки с запятой) держит Prettier, поэтому правила форматирования ESLint
// отключены: два инструмента не должны спорить за одну строку.
//
// Границы зон проверяет `scripts/check-zones.mjs`, полноту словаря —
// `scripts/check-messages.mjs`: это правила проекта, а не синтаксис.

import js from "@eslint/js";
import pluginVue from "eslint-plugin-vue";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "src-tauri/**",
      "assets/**",
      ".scratch/**",
      ".agents/**",
      "docs/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs["flat/essential"],
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.es2021 },
    },
  },
  {
    files: ["scripts/**/*.mjs", "tests/**/*.mjs", "vite.config.ts", "eslint.config.js"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ["tests/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // В тестах `!` после поиска — часть проверки сценария:
      // отсутствие значения должно ронять тест, а не прятаться.
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: [".vue"],
      },
    },
    rules: {
      // Компонент, объявленный в `components`, но не использованный
      // в шаблоне, — забытая правка, а не стиль.
      "vue/no-unused-components": "error",
      // «Sidebar» — часть оболочки, а не имя HTML-элемента; правило
      // остаётся для остальных компонентов.
      "vue/multi-word-component-names": ["error", { ignores: ["Sidebar"] }],
    },
  },
  prettier,
];

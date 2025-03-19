import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import pluginJs from "@eslint/js";
import pluginVue from "eslint-plugin-vue";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        Peer: "readonly",
        lucide: "readonly",
        QRCode: "readonly",
      },
    },
  },
  pluginJs.configs.all,
  ...pluginVue.configs["flat/recommended"],
  {
    rules: {
      "no-magic-numbers": "off",
      "sort-keys": "off",
      "no-warning-comments": "off",
      "no-inline-comments": "off", // TODO remove
      "no-ternary": "off",
      "one-var": "off",
      "max-statements": ["warn", 200], // TODO remove
      "max-lines-per-function": ["warn", 200], // TODO remove
      "max-params": ["warn", 5],
      "max-lines": "off",
      "no-console": "off", // TODO remove
    },
  },
  {
    rules: {},
  },
  eslintConfigPrettier,
];

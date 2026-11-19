import { defineConfig } from "eslint/config";
import base from "./eslint.config.mjs";

/**
 * Code-quality gates layered on the base lint rules. `npm run lint` uses this file.
 * Application code must stay small, shallow and free of bare numbers; tests are exempt because
 * their describe blocks are long by nature.
 */
export default defineConfig([
  ...base,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      complexity: ["error", 10],
      "max-depth": ["error", 3],
      "max-params": ["error", 4],
      "max-nested-callbacks": ["error", 3],
      "max-lines": ["error", { max: 200, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": [
        "error",
        { max: 30, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      "no-magic-numbers": "off",
      "@typescript-eslint/no-magic-numbers": [
        "error",
        {
          ignore: [0, 1, -1, 2, 100, 1000],
          ignoreArrayIndexes: true,
          ignoreDefaultValues: true,
          ignoreNumericLiteralTypes: true,
          enforceConst: true,
        },
      ],
    },
  },
]);

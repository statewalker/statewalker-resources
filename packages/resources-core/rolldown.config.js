import { defineConfig } from "rolldown";

export default defineConfig([
  {
    input: "src/index.ts",
    output: {
      dir: "dist/esm",
      format: "esm",
      entryFileNames: "[name].js",
    },
    external: [/^@statewalker\//],
  },
  {
    input: "src/index.ts",
    output: {
      dir: "dist/cjs",
      format: "cjs",
      entryFileNames: "[name].cjs",
    },
    external: [/^@statewalker\//],
  },
]);

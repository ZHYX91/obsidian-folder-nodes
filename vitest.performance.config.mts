import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      obsidian: fileURLToPath(new URL("./tests/mocks/obsidian.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["benchmarks/**/*.test.ts"],
    maxWorkers: 1,
    sequence: { concurrent: false },
    testTimeout: 20_000,
  },
});

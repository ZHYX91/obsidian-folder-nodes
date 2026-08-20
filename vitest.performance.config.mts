import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["benchmarks/**/*.test.ts"],
    testTimeout: 20_000,
  },
});

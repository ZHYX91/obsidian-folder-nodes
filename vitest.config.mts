import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      obsidian: fileURLToPath(new URL("./tests/mocks/obsidian.ts", import.meta.url)),
    },
  },
  test: {
    coverage: {
      exclude: ["src/**/*.d.ts"],
      include: [
        "src/core/**/*.ts",
        "src/shared/settings.ts",
        "src/adapters/node-service.ts",
        "src/adapters/visual-service.ts",
        "src/adapters/vault-operation-coordinator.ts",
        "src/adapters/explorer-events.ts",
        "src/app/node-graph-index.ts",
        "src/app/node-graph-plugin.ts",
        "src/app/refresh-scheduler.ts",
        "src/ui/contents-interactions.ts",
        "src/ui/node-graph-canvas-renderer.ts",
        "src/ui/node-graph-view.ts",
        "src/ui/submitting-modal.ts",
      ],
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      thresholds: {
        branches: 70,
        functions: 75,
        lines: 80,
        statements: 80
      }
    },
    environment: "happy-dom",
    exclude: [...configDefaults.exclude, "benchmarks/**"],
    setupFiles: ["./tests/setup/obsidian-dom.ts"],
  },
});

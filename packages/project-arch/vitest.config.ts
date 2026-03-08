import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    hookTimeout: 60_000,
    testTimeout: 60_000,
    fileParallelism: false,
    exclude: ["**/node_modules/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: ["node_modules/", "dist/", "**/*.test.ts", "**/test/**", "**/types/**", "**/*.d.ts"],
      lines: 80,
      functions: 80,
      branches: 75,
      statements: 80,
      skipFull: false,
      reportOnFailure: true,
    },
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    setupFiles: ["./test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Type-only contracts have no runtime; global.ts is the browser bootstrap
      // exercised by the classic UI lane. Test helpers never inflate coverage.
      exclude: ["src/**/*.d.ts", "src/types.ts", "src/global.ts"],
      reporter: ["text", "json-summary", "lcov"],
      thresholds: {
        // A highly covered parser must not hide an untested engine module.
        perFile: true,
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});

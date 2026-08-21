import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: './tests/globalSetup.ts',
    setupFiles: ['./tests/setup.ts'],
    // Playwright specs live under tests/e2e and run via `playwright test`, not vitest.
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
    // Prefer .ts over stale compiled .js siblings under server/
    server: {
      deps: {
        inline: [/server\//],
      },
    },
    coverage: {
      provider: 'v8',
      include: ['server/utils/**/*.ts', 'server/services/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.js', 'server/services/miracleExport.ts'],
      thresholds: {
        statements: 88,
        branches: 75,
        functions: 88,
        lines: 88,
      },
      reporter: ['text', 'json-summary'],
    },
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  },
});

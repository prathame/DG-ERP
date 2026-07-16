import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['server/utils/**', 'server/services/**', 'server/routes/**'],
      exclude: ['server/routes/super-admin.ts', '**/*.test.ts'],
      thresholds: {
        statements: 50,
        branches: 40,
        functions: 50,
        lines: 50,
      },
      reporter: ['text', 'json-summary'],
    },
  },
});

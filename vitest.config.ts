import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['server/utils/**/*.js', 'server/services/**/*.js'],
      exclude: ['**/*.test.ts', '**/*.test.js'],
      thresholds: {
        statements: 15,
        branches: 10,
        functions: 15,
        lines: 15,
      },
      reporter: ['text', 'json-summary'],
    },
  },
});

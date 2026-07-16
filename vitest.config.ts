import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Prefer .ts over stale compiled .js siblings under server/
    server: {
      deps: {
        inline: [/server\//],
      },
    },
    coverage: {
      provider: 'v8',
      include: ['server/utils/**/*.ts', 'server/services/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.js'],
      thresholds: {
        statements: 90,
        branches: 75,
        functions: 90,
        lines: 90,
      },
      reporter: ['text', 'json-summary'],
    },
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: './tests/globalSetup.ts',
    // Prefer .ts over stale compiled .js siblings under server/
    server: {
      deps: {
        inline: [/server\//],
      },
    },
    coverage: {
      provider: 'v8',
      include: [
        'server/utils/**/*.ts',
        'server/services/**/*.ts',
        'src/platforms/shared/**/*.ts',
        'src/platforms/mobile/offline/**/*.ts',
        'src/platforms/mobile/online/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.js',
        'src/platforms/mobile/offline/network.ts',
      ],
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

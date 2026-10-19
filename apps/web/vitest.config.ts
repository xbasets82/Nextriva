import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.js';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      environment: 'jsdom',
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
        reporter: ['text', 'json-summary', 'lcov'],
        thresholds: {
          lines: 80,
          functions: 80,
          statements: 80,
          branches: 75,
        },
      },
    },
  }),
);

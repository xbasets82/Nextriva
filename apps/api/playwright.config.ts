import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://127.0.0.1:4317',
  },
  webServer: {
    command: 'pnpm build && PORT=4317 node dist/main.js',
    url: 'http://127.0.0.1:4317/api/health',
    wait: { stdout: /Nest application successfully started/ },
    reuseExistingServer: false,
    timeout: 30_000,
  },
});

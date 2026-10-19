import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://127.0.0.1:5173',
  },
  webServer: [
    {
      name: 'API',
      command: 'pnpm build && PORT=4317 node dist/main.js',
      url: 'http://127.0.0.1:4317/api/health',
      wait: { stdout: /Nest application successfully started/ },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      name: 'Web',
      command: 'pnpm --filter @nextriva/web exec vite --host 127.0.0.1 --port 5173 --strictPort',
      env: { API_PROXY_TARGET: 'http://127.0.0.1:4317' },
      cwd: '../..',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});

import { defineConfig } from '@playwright/test';

function testPort(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1024 || Number(value) > 65535)
    throw new Error('Invalid E2E port');
  return Number(value);
}
const apiPort = testPort(process.env.NEXTRIVA_E2E_API_PORT, 4317);
const webPort = testPort(process.env.NEXTRIVA_E2E_WEB_PORT, 5173);
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: './e2e',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: webUrl,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      name: 'API',
      env: {
        NODE_ENV: 'development',
        AUTH_ORIGIN: webUrl,
        AUTH_LOCAL_HTTP: 'true',
        AUTH_DATABASE_MODE: 'isolated-test',
      },
      command: `pnpm build && PORT=${apiPort} node dist/src/main.js`,
      url: `${apiUrl}/api/health`,
      wait: { stdout: /Nest application successfully started/ },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      name: 'Web',
      command: `pnpm --filter @nextriva/web exec vite --host 127.0.0.1 --port ${webPort} --strictPort`,
      env: { API_PROXY_TARGET: apiUrl },
      cwd: '../..',
      url: webUrl,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});

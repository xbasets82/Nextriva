import { defineConfig } from '@playwright/test';

const origin = process.env.NEXTRIVA_DEMO_TEST_ORIGIN ?? '';
if (
  !/^https:\/\/127\.0\.0\.1:\d+$/.test(origin) ||
  !process.env.NEXTRIVA_DEMO_TEST_CERT_PIN
) {
  throw new Error(
    'Ejecuta exclusivamente el runner local test:e2e:production.',
  );
}

export default defineConfig({
  testDir: './e2e-production',
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  outputDir: 'test-results-production',
  use: {
    baseURL: origin,
    ignoreHTTPSErrors: false,
    launchOptions: {
      args: [
        `--ignore-certificate-errors-spki-list=${process.env.NEXTRIVA_DEMO_TEST_CERT_PIN}`,
      ],
    },
    // Las capturas/trazas de login podrían contener credenciales de la sesión efímera.
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
});

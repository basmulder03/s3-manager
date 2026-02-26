import { defineConfig, devices } from '@playwright/test';

const apiOrigin = process.env.E2E_API_ORIGIN ?? 'http://127.0.0.1:3000';
const webOrigin = process.env.E2E_WEB_ORIGIN ?? 'http://127.0.0.1:5173';
const s3Endpoint = process.env.E2E_S3_ENDPOINT ?? 'http://127.0.0.1:4566';
const managedServers = process.env.E2E_MANAGED_SERVERS === 'true';

const webServer = managedServers
  ? [
      {
        command: 'bun run --cwd ../server dev',
        url: `${apiOrigin}/health`,
        reuseExistingServer: true,
        timeout: 120_000,
        env: {
          NODE_ENV: 'test',
          PORT: new URL(apiOrigin).port,
          SECRET_KEY: 'stage5-e2e-secret',
          LOCAL_DEV_MODE: 'true',
          AUTH_REQUIRED: 'false',
          S3_ENDPOINT: s3Endpoint,
          S3_ACCESS_KEY: process.env.AWS_ACCESS_KEY_ID ?? 'test',
          S3_SECRET_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
        },
      },
      {
        command: `bun run dev --host 127.0.0.1 --port ${new URL(webOrigin).port}`,
        url: webOrigin,
        reuseExistingServer: true,
        timeout: 120_000,
        env: {
          VITE_API_URL: `${apiOrigin}/trpc`,
        },
      },
    ]
  : undefined;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html'], ['github']] : 'list',
  use: {
    baseURL: webOrigin,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer,
});

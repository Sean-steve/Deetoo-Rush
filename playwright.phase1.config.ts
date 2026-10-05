import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: /phase1-independent-apps\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  use: {
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm dev:api',
      url: 'http://127.0.0.1:3000/health',
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        APP_ENV: 'development',
        NODE_ENV: 'development',
        DEETOO_STORAGE_MODE: 'memory',
        DEETOO_FIXTURES: 'true',
        PORT: '3000',
      },
    },
    {
      command: 'pnpm dev:customer --host 127.0.0.1',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'pnpm dev:merchant --host 127.0.0.1',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'pnpm dev:admin --host 127.0.0.1',
      url: 'http://127.0.0.1:5175',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});

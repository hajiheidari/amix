import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// Use the pre-installed Chromium when the bundled revision is not downloaded.
const preinstalled = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => existsSync(p));
const launchOptions = process.env.PW_USE_BUNDLED || !preinstalled ? {} : { executablePath: preinstalled };

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure', launchOptions },
  webServer: {
    command: 'pnpm --filter @tc/client build && pnpm --filter @tc/client preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
});

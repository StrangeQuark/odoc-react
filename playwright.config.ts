import { defineConfig } from '@playwright/test';

const mockMode = process.env.ODOC_E2E_MODE === 'mock';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  use: {
    baseURL:
      process.env.ODOC_E2E_BASE_URL ??
      (mockMode ? 'http://127.0.0.1:4173' : 'http://127.0.0.1:8081'),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: mockMode
    ? {
        command: 'corepack pnpm vite preview --host 127.0.0.1 --port 4173',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI,
      }
    : undefined,
});

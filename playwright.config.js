const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.LYANN_E2E_BASE_URL || 'http://127.0.0.1:8080',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 }
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: process.env.LYANN_E2E_BASE_URL ? undefined : {
    command: 'PORT=8080 node api/server.js',
    port: 8080,
    reuseExistingServer: !process.env.CI
  }
});

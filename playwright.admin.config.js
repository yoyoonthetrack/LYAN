const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: /admin_(backoffice|design_v2)\.spec\.js/,
  timeout: 30000,
  expect: { timeout: 8000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8766',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 }
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'python3 -m http.server 8766 --bind 127.0.0.1',
    port: 8766,
    reuseExistingServer: false
  }
});

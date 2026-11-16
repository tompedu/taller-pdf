const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60000,
  retries: 1,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:8099', serviceWorkers: 'block', acceptDownloads: true },
  webServer: { command: 'node tools/servidor.js 8099', url: 'http://localhost:8099', reuseExistingServer: true },
});

const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
    testDir: './test/browser', workers: 1, timeout: 60000,
    use: { baseURL: 'http://127.0.0.1:3189', headless: true, trace: 'retain-on-failure',
        ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) },
    webServer: { command: 'node test/browser-server.js', url: 'http://127.0.0.1:3189/api/saude', reuseExistingServer: false, timeout: 15000 },
});

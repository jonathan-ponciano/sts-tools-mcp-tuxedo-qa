import { defineConfig } from '@playwright/test';

const extraHTTPHeaders = process.env.TUXEDO_EXTRA_HEADERS
  ? (JSON.parse(process.env.TUXEDO_EXTRA_HEADERS) as Record<string, string>)
  : {};

export default defineConfig({
  testDir: './tests',
  reporter: [
    ['json', { outputFile: 'results/last-run.json' }],
    ['list'],
  ],
  use: {
    extraHTTPHeaders,
    screenshot: 'only-on-failure',
    video: 'off',
    headless: process.env.PWHEADED !== '1',
  },
  timeout: 30000,
});

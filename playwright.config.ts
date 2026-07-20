import { defineConfig } from '@playwright/test';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const extraHTTPHeaders = process.env.TUXEDO_EXTRA_HEADERS
  ? (JSON.parse(process.env.TUXEDO_EXTRA_HEADERS) as Record<string, string>)
  : {};

// Mirrors src/lib/paths.ts NAMESPACE — lets one installation serve several
// isolated projects, each pointed at its own tests/results via this env var.
const project = process.env.TUXEDO_QA_PROJECT?.replace(/[^a-zA-Z0-9_-]/g, '') || null;
const namespace = project ? join(__dirname, 'projects', project) : __dirname;

export default defineConfig({
  testDir: join(namespace, 'tests'),
  reporter: [
    ['json', { outputFile: join(namespace, 'results', 'last-run.json') }],
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

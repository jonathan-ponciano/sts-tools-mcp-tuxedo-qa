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

// Mirrors src/lib/paths.ts dryRunFor() — create_test/update_test validate a
// test by actually running it before saving. That run must not land in
// last-run.json (it isn't a real monitored run), or it'd overwrite the
// suite's real last-known status and get counted into run-history's uptime%.
const isDryRun = process.env.TUXEDO_IS_DRY_RUN === 'true';
const resultsFilename = isDryRun ? 'dry-run.json' : 'last-run.json';

export default defineConfig({
  testDir: join(namespace, 'tests'),
  reporter: [
    ['json', { outputFile: join(namespace, 'results', resultsFilename) }],
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

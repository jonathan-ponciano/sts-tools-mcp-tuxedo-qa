import { existsSync, readFileSync, readdirSync } from 'fs';
import { z } from 'zod';
import { runPlaywright } from '../lib/playwright-runner.js';
import { readLastRun } from '../lib/results-store.js';
import { sendDiscordWebhook } from '../lib/discord-webhook.js';
import { TESTS_DIR, WEBHOOK_CONFIG } from '../lib/paths.js';
import { isTestsPaused } from './pause-tests.js';
import { getTestMeta, upsertTestMeta } from '../lib/test-metadata.js';
import { basename } from 'path';

export const runTestsSchema = z.object({
  test_file: z
    .string()
    .optional()
    .describe('Specific test file to run. Omit to run all tests.'),
  wait_for_result: z
    .boolean()
    .optional()
    .describe('Wait up to 3 min for result (default: true). Set false to fire-and-forget.'),
});

export type RunTestsInput = z.infer<typeof runTestsSchema>;

interface WebhookConfig {
  url: string;
  events: 'failure' | 'all';
}

function loadWebhookConfig(): WebhookConfig | null {
  if (!existsSync(WEBHOOK_CONFIG)) return null;
  return JSON.parse(readFileSync(WEBHOOK_CONFIG, 'utf-8')) as WebhookConfig;
}

function isTestEnabled(testFile?: string): { enabled: boolean; file?: string } {
  if (!testFile) return { enabled: true };
  const filename = basename(testFile);
  const meta = getTestMeta(filename.endsWith('.spec.ts') ? filename : `${filename}.spec.ts`);
  return { enabled: meta?.enabled ?? true, file: filename };
}

function formatSummary(exitCode: number, output: string): string {
  const summary = readLastRun();
  if (!summary) return `Playwright exited with code ${exitCode}.\n\n${output}`;

  const lines = [
    `Run at: ${summary.run_at}`,
    `Passed: ${summary.passed} | Failed: ${summary.failed} | Skipped: ${summary.skipped}`,
    `Duration: ${(summary.duration_ms / 1000).toFixed(1)}s`,
  ];

  if (summary.failures.length > 0) {
    lines.push('', 'Failures:');
    for (const f of summary.failures) {
      lines.push(`  [${f.error_code}] ${f.test}`);
      lines.push(`    ${f.error.split('\n')[0]}`);
    }
  }

  return lines.join('\n');
}

// Stamp last_run_at on whichever test(s) this invocation covered, so the
// scheduler knows when each one is next due.
function markRan(testFile: string | undefined, ranAt: string): void {
  if (testFile) {
    const filename = basename(testFile.endsWith('.spec.ts') ? testFile : `${testFile}.spec.ts`);
    upsertTestMeta(filename, { last_run_at: ranAt });
    return;
  }
  if (!existsSync(TESTS_DIR)) return;
  for (const file of readdirSync(TESTS_DIR).filter((f) => f.endsWith('.spec.ts'))) {
    upsertTestMeta(file, { last_run_at: ranAt });
  }
}

export async function runTests(input: RunTestsInput): Promise<string> {
  const pause = isTestsPaused();
  if (pause.paused) {
    const resumeAt = new Date(pause.until!).toLocaleTimeString();
    const lines = [`Tests are currently paused until ${resumeAt}.`];
    if (pause.reason) lines.push(`Reason: ${pause.reason}`);
    lines.push('Run will be skipped. Call pause_tests with duration_minutes=1 to override early.');
    return lines.join('\n');
  }

  const { enabled, file } = isTestEnabled(input.test_file);
  if (!enabled) {
    return `Test "${file}" is disabled. Use update_test with enabled: true to re-enable it.`;
  }

  const waitForResult = input.wait_for_result ?? true;

  const credentialLabel = input.test_file
    ? getTestMeta(basename(input.test_file.endsWith('.spec.ts') ? input.test_file : `${input.test_file}.spec.ts`))?.credential
    : undefined;

  if (!waitForResult) {
    runPlaywright({ testFile: input.test_file, credentialLabel }).then(async ({ exitCode, output }) => {
      const summary = readLastRun();
      markRan(input.test_file, summary?.run_at ?? new Date().toISOString());

      const webhook = loadWebhookConfig();
      if (!webhook || !summary) return;
      const shouldNotify = webhook.events === 'all' || (webhook.events === 'failure' && summary.failed > 0);
      if (shouldNotify) await sendDiscordWebhook(webhook.url, summary).catch(() => {});
    });
    return 'Test run started in background. Use get_status to check results.';
  }

  const { exitCode, output } = await runPlaywright({ testFile: input.test_file, credentialLabel });
  const summary = readLastRun();
  markRan(input.test_file, summary?.run_at ?? new Date().toISOString());

  const webhook = loadWebhookConfig();
  if (webhook && summary) {
    const shouldNotify = webhook.events === 'all' || (webhook.events === 'failure' && summary.failed > 0);
    if (shouldNotify) {
      try { await sendDiscordWebhook(webhook.url, summary); } catch { /* non-fatal */ }
    }
  }

  return formatSummary(exitCode, output);
}

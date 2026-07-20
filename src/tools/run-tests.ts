import { existsSync, readdirSync, writeFileSync } from 'fs';
import { basename } from 'path';
import { z } from 'zod';
import { runPlaywright } from '../lib/playwright-runner.js';
import { readLastRun, type RunSummary } from '../lib/results-store.js';
import { sendDiscordWebhook } from '../lib/discord-webhook.js';
import { readWebhook } from '../lib/webhook-store.js';
import { testsDirFor, configDirFor, lastRunFor, CURRENT_PROJECT } from '../lib/paths.js';
import { isTestsPaused } from './pause-tests.js';
import { getAllMeta, getTestMeta, upsertTestMeta } from '../lib/test-metadata.js';

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

function formatSummary(summary: RunSummary | null, exitCode: number, output: string): string {
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

async function notifyWebhook(summary: RunSummary | null, configDir: string): Promise<void> {
  const webhook = readWebhook(configDir);
  if (!webhook || !summary) return;
  const shouldNotify = webhook.events === 'all' || (webhook.events === 'failure' && summary.failed > 0);
  if (shouldNotify) await sendDiscordWebhook(webhook.url, summary).catch(() => {});
}

// Runs one specific test file, credential included.
async function runOneFile(
  testFile: string,
  configDir: string,
  lastRunPath: string,
  project: string | null,
): Promise<{ exitCode: number; output: string; summary: RunSummary | null }> {
  const filename = basename(testFile.endsWith('.spec.ts') ? testFile : `${testFile}.spec.ts`);
  const credentialLabel = getTestMeta(filename, configDir)?.credential;

  const { exitCode, output } = await runPlaywright({ testFile: filename, credentialLabel, project });
  const summary = readLastRun(lastRunPath);
  upsertTestMeta(filename, { last_run_at: summary?.run_at ?? new Date().toISOString() }, configDir);

  return { exitCode, output, summary };
}

// Runs every enabled test file one at a time — each gets its own credential
// injected, which a single shared Playwright process (one env var for the
// whole run) can't do. Slower than letting Playwright parallelize across
// files itself, but the only way "run all" ends up correct when different
// tests need different credential sets.
async function runAllEnabledFiles(
  testsDir: string,
  configDir: string,
  lastRunPath: string,
  project: string | null,
): Promise<{ exitCode: number; output: string; summary: RunSummary | null }> {
  if (!existsSync(testsDir)) return { exitCode: 1, output: 'No tests directory found.', summary: null };

  const meta = getAllMeta(configDir);
  const files = readdirSync(testsDir)
    .filter((f) => f.endsWith('.spec.ts'))
    .filter((f) => meta[f]?.enabled !== false);

  const summaries: RunSummary[] = [];
  const outputs: string[] = [];
  let lastExitCode = 0;

  for (const file of files) {
    const result = await runOneFile(file, configDir, lastRunPath, project);
    outputs.push(result.output);
    lastExitCode = result.exitCode;
    if (result.summary) summaries.push(result.summary);
  }

  if (summaries.length === 0) return { exitCode: lastExitCode, output: outputs.join('\n'), summary: null };

  const merged: RunSummary = {
    run_at: summaries[0].run_at,
    duration_ms: summaries.reduce((sum, s) => sum + s.duration_ms, 0),
    passed: summaries.reduce((sum, s) => sum + s.passed, 0),
    failed: summaries.reduce((sum, s) => sum + s.failed, 0),
    skipped: summaries.reduce((sum, s) => sum + s.skipped, 0),
    failures: summaries.flatMap((s) => s.failures),
  };

  // Persist the merged view so anything reading last-run.json afterward
  // (dashboard, get_status) sees the whole batch, not just the last file.
  writeFileSync(lastRunPath, JSON.stringify(merged, null, 2), 'utf-8');

  return { exitCode: merged.failed > 0 ? 1 : 0, output: outputs.join('\n'), summary: merged };
}

// `project` is only ever passed by the dashboard — an MCP connection is
// always scoped to a single project via its own TUXEDO_QA_PROJECT.
export async function runTests(input: RunTestsInput, project?: string | null): Promise<string> {
  const p = project !== undefined ? project : CURRENT_PROJECT;
  const testsDir = testsDirFor(p);
  const configDir = configDirFor(p);
  const lastRunPath = lastRunFor(p);

  const pause = isTestsPaused(configDir);
  if (pause.paused) {
    const resumeAt = new Date(pause.until!).toLocaleTimeString();
    const lines = [`Tests are currently paused until ${resumeAt}.`];
    if (pause.reason) lines.push(`Reason: ${pause.reason}`);
    lines.push('Run will be skipped. Call pause_tests with duration_minutes=1 to override early.');
    return lines.join('\n');
  }

  if (input.test_file) {
    const filename = basename(input.test_file.endsWith('.spec.ts') ? input.test_file : `${input.test_file}.spec.ts`);
    const meta = getTestMeta(filename, configDir);
    if (meta?.enabled === false) {
      return `Test "${filename}" is disabled. Use update_test with enabled: true to re-enable it.`;
    }
  }

  const waitForResult = input.wait_for_result ?? true;
  const run = () => input.test_file
    ? runOneFile(input.test_file!, configDir, lastRunPath, p)
    : runAllEnabledFiles(testsDir, configDir, lastRunPath, p);

  if (!waitForResult) {
    run().then(({ summary }) => notifyWebhook(summary, configDir));
    return 'Test run started in background. Use get_status to check results.';
  }

  const { exitCode, output, summary } = await run();
  await notifyWebhook(summary, configDir);
  return formatSummary(summary, exitCode, output);
}

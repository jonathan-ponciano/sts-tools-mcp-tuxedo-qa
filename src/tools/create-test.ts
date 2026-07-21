import { writeFileSync, existsSync, renameSync, unlinkSync } from 'fs';
import { join, basename } from 'path';
import { z } from 'zod';
import { testsDirFor, configDirFor, dryRunFor, ensureProjectReady, CURRENT_PROJECT } from '../lib/paths.js';
import { upsertTestMeta } from '../lib/test-metadata.js';
import { runPlaywright } from '../lib/playwright-runner.js';
import { readLastRun } from '../lib/results-store.js';

export const createTestSchema = z.object({
  name: z.string().describe('Test file name without extension (e.g. "login-meuapp")'),
  test_code: z.string().describe('Full Playwright test code to write'),
  display_name: z
    .string()
    .optional()
    .describe('Human-readable name shown in the dashboard/list_tests (e.g. "Login — conta admin"). Falls back to the file name if omitted.'),
  description: z
    .string()
    .optional()
    .describe('What this test verifies, in plain language (e.g. "Confere que o admin loga e vê o dashboard carregar"). Shown wherever the test is listed.'),
  schedule: z
    .enum(['1h', '6h', '24h'])
    .optional()
    .describe('Run frequency — use "1h" for critical flows (default: "24h")'),
  tags: z
    .array(z.string())
    .optional()
    .describe('Tags to group tests (e.g. ["checkout", "critical"])'),
  credential: z
    .string()
    .optional()
    .describe('Credential set label to inject as credentials.* in the test (e.g. "meuapp-prod")'),
});

export type CreateTestInput = z.infer<typeof createTestSchema>;

// `project` is only ever passed by the dashboard (which manages every
// project from one process); an MCP connection is always scoped to a
// single project via its own TUXEDO_QA_PROJECT, so tool calls never set it.
export async function createTest(input: CreateTestInput, project?: string | null): Promise<string> {
  const p = project !== undefined ? project : CURRENT_PROJECT;
  const testsDir = testsDirFor(p);
  ensureProjectReady(p);

  const safeName = basename(input.name).replace(/\.spec\.ts$/, '');
  const filename = `${safeName}.spec.ts`;
  const finalPath = join(testsDir, filename);

  if (existsSync(finalPath)) {
    throw new Error(`Test "${filename}" already exists. Use update_test to modify it.`);
  }

  // dry-run: write to a temp file, run, then promote or discard
  const dryRunFilename = `__dryrun_${safeName}.spec.ts`;
  const dryRunPath = join(testsDir, dryRunFilename);

  writeFileSync(dryRunPath, input.test_code, 'utf-8');

  let dryRunResult: string;
  try {
    const { exitCode } = await runPlaywright({ testFile: dryRunFilename, credentialLabel: input.credential, project: p, dryRun: true });
    const summary = readLastRun(dryRunFor(p));

    const dryRunFailure = summary?.failures.find((f) => basename(f.file) === dryRunFilename);

    if (exitCode === 0 && !dryRunFailure) {
      // passed — promote to final name
      renameSync(dryRunPath, finalPath);

      upsertTestMeta(filename, {
        schedule: input.schedule ?? '24h',
        tags: input.tags ?? [],
        ...(input.credential ? { credential: input.credential } : {}),
        ...(input.display_name ? { name: input.display_name } : {}),
        ...(input.description ? { description: input.description } : {}),
        enabled: true,
        // Sandboxed until a human validates it — the scheduler won't pick
        // this up and the webhook stays quiet for it, no matter the
        // schedule, until someone runs it manually and confirms it's good
        // (dashboard "Validar", or update_test with validated: true).
        validated: false,
      }, configDirFor(p));

      const parts = [`Test created and dry-run passed: ${finalPath}`];
      if (input.display_name) parts.push(`Name: ${input.display_name}`);
      if (input.schedule) parts.push(`Schedule: every ${input.schedule}`);
      if (input.tags?.length) parts.push(`Tags: ${input.tags.join(', ')}`);
      parts.push(
        'Sandboxed: this test is unvalidated, so it will NOT run automatically yet — ' +
          'run it manually (run_tests, or "Rodar" in the dashboard) and confirm the result looks right, ' +
          'then mark it validated (update_test with validated: true, or "Validar" in the dashboard) to enable scheduling and webhook alerts for it.',
      );
      return parts.join('\n');
    }

    // failed — report without saving
    const error = dryRunFailure
      ? `[${dryRunFailure.error_code}] ${dryRunFailure.error.split('\n')[0]}`
      : `Playwright exited with code ${exitCode}`;

    dryRunResult = `Dry-run FAILED — test not saved.\n\nError: ${error}\n\nFix the script and try again.`;
  } finally {
    if (existsSync(dryRunPath)) unlinkSync(dryRunPath);
  }

  return dryRunResult!;
}

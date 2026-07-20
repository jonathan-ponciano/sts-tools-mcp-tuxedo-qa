import { writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'fs';
import { join, basename } from 'path';
import { z } from 'zod';
import { TESTS_DIR } from '../lib/paths.js';
import { upsertTestMeta } from '../lib/test-metadata.js';
import { runPlaywright } from '../lib/playwright-runner.js';
import { readLastRun } from '../lib/results-store.js';

export const createTestSchema = z.object({
  name: z.string().describe('Test file name without extension (e.g. "login-meuapp")'),
  test_code: z.string().describe('Full Playwright test code to write'),
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

export async function createTest(input: CreateTestInput): Promise<string> {
  mkdirSync(TESTS_DIR, { recursive: true });

  const safeName = basename(input.name).replace(/\.spec\.ts$/, '');
  const filename = `${safeName}.spec.ts`;
  const finalPath = join(TESTS_DIR, filename);

  if (existsSync(finalPath)) {
    throw new Error(`Test "${filename}" already exists. Use update_test to modify it.`);
  }

  // dry-run: write to a temp file, run, then promote or discard
  const dryRunFilename = `__dryrun_${safeName}.spec.ts`;
  const dryRunPath = join(TESTS_DIR, dryRunFilename);

  writeFileSync(dryRunPath, input.test_code, 'utf-8');

  let dryRunResult: string;
  try {
    const { exitCode } = await runPlaywright({ testFile: dryRunFilename });
    const summary = readLastRun();

    const dryRunFailure = summary?.failures.find((f) => basename(f.file) === dryRunFilename);

    if (exitCode === 0 && !dryRunFailure) {
      // passed — promote to final name
      renameSync(dryRunPath, finalPath);

      upsertTestMeta(filename, {
        schedule: input.schedule ?? '24h',
        tags: input.tags ?? [],
        ...(input.credential ? { credential: input.credential } : {}),
        enabled: true,
      });

      const parts = [`Test created and dry-run passed: ${finalPath}`];
      if (input.schedule) parts.push(`Schedule: every ${input.schedule}`);
      if (input.tags?.length) parts.push(`Tags: ${input.tags.join(', ')}`);
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

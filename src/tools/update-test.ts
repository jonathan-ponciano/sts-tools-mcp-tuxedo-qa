import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { z } from 'zod';
import { testsDirFor, configDirFor, dryRunFor, CURRENT_PROJECT } from '../lib/paths.js';
import { getTestMeta, upsertTestMeta } from '../lib/test-metadata.js';
import { runPlaywright } from '../lib/playwright-runner.js';
import { readLastRun } from '../lib/results-store.js';

export const updateTestSchema = z.object({
  name: z.string().describe('Test file name (with or without .spec.ts)'),
  test_code: z.string().optional().describe('New full Playwright test code'),
  display_name: z.string().optional().describe('Human-readable name for the test'),
  description: z.string().optional().describe('What the test verifies'),
  schedule: z
    .enum(['1h', '6h', '24h'])
    .optional()
    .describe('Run frequency (1h for critical flows)'),
  enabled: z
    .boolean()
    .optional()
    .describe('Set false to disable without deleting'),
  credential: z
    .string()
    .optional()
    .describe('Credential set label to inject as credentials.* in the test (e.g. "meuapp-prod")'),
});

export type UpdateTestInput = z.infer<typeof updateTestSchema>;

// `project` is only ever passed by the dashboard — an MCP connection is
// always scoped to a single project via its own TUXEDO_QA_PROJECT.
export async function updateTest(input: UpdateTestInput, project?: string | null): Promise<string> {
  const p = project !== undefined ? project : CURRENT_PROJECT;
  const { name, test_code, display_name, description, schedule, enabled, credential } = input;
  const safeName = basename(name).replace(/\.spec\.ts$/, '');
  const filename = `${safeName}.spec.ts`;
  const filePath = join(testsDirFor(p), filename);
  const configDir = configDirFor(p);

  if (!existsSync(filePath)) {
    throw new Error(`Test "${filename}" not found. Use create_test to create it.`);
  }

  const changes: string[] = [];

  if (test_code !== undefined) {
    // Same dry-run-then-promote-or-discard idea as create_test — except
    // here there's already a working version on disk, so "discard" means
    // restoring it rather than deleting a file. Without this, a bad edit
    // (from the dashboard's code editor or a chat-driven update_test call)
    // would silently break a previously-passing scheduled test.
    const previousCode = readFileSync(filePath, 'utf-8');
    writeFileSync(filePath, test_code, 'utf-8');

    const credentialForDryRun = credential !== undefined ? credential : getTestMeta(filename, configDir)?.credential;
    const { exitCode } = await runPlaywright({
      testFile: filename,
      credentialLabel: credentialForDryRun,
      project: p,
      dryRun: true,
    });
    const summary = readLastRun(dryRunFor(p));
    const dryRunFailure = summary?.failures.find((f) => basename(f.file) === filename);

    if (exitCode !== 0 || dryRunFailure) {
      writeFileSync(filePath, previousCode, 'utf-8');
      const error = dryRunFailure
        ? `[${dryRunFailure.error_code}] ${dryRunFailure.error.split('\n')[0]}`
        : `Playwright exited with code ${exitCode}`;
      return `Dry-run FAILED — edit rejected, test left unchanged.\n\nError: ${error}\n\nFix the script and try again.`;
    }

    changes.push('script');
  }

  const metaUpdates: Record<string, unknown> = {};
  if (display_name !== undefined) { metaUpdates.name = display_name; changes.push('name'); }
  if (description !== undefined) { metaUpdates.description = description; changes.push('description'); }
  if (schedule !== undefined) { metaUpdates.schedule = schedule; changes.push('schedule'); }
  if (enabled !== undefined) { metaUpdates.enabled = enabled; changes.push('enabled'); }
  if (credential !== undefined) { metaUpdates.credential = credential; changes.push('credential'); }

  if (Object.keys(metaUpdates).length > 0) {
    upsertTestMeta(filename, metaUpdates as Parameters<typeof upsertTestMeta>[1], configDir);
  }

  if (changes.length === 0) {
    return 'Nothing to update — provide at least one field to change.';
  }

  return `Test "${filename}" updated: ${changes.join(', ')}.`;
}

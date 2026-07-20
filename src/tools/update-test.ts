import { writeFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { z } from 'zod';
import { TESTS_DIR } from '../lib/paths.js';
import { upsertTestMeta } from '../lib/test-metadata.js';

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

export function updateTest(input: UpdateTestInput): string {
  const { name, test_code, display_name, description, schedule, enabled, credential } = input;
  const safeName = basename(name).replace(/\.spec\.ts$/, '');
  const filename = `${safeName}.spec.ts`;
  const filePath = join(TESTS_DIR, filename);

  if (!existsSync(filePath)) {
    throw new Error(`Test "${filename}" not found. Use create_test to create it.`);
  }

  const changes: string[] = [];

  if (test_code !== undefined) {
    writeFileSync(filePath, test_code, 'utf-8');
    changes.push('script');
  }

  const metaUpdates: Record<string, unknown> = {};
  if (display_name !== undefined) { metaUpdates.name = display_name; changes.push('name'); }
  if (description !== undefined) { metaUpdates.description = description; changes.push('description'); }
  if (schedule !== undefined) { metaUpdates.schedule = schedule; changes.push('schedule'); }
  if (enabled !== undefined) { metaUpdates.enabled = enabled; changes.push('enabled'); }
  if (credential !== undefined) { metaUpdates.credential = credential; changes.push('credential'); }

  if (Object.keys(metaUpdates).length > 0) {
    upsertTestMeta(filename, metaUpdates as Parameters<typeof upsertTestMeta>[1]);
  }

  if (changes.length === 0) {
    return 'Nothing to update — provide at least one field to change.';
  }

  return `Test "${filename}" updated: ${changes.join(', ')}.`;
}

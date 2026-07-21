import { readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { TESTS_DIR } from '../lib/paths.js';
import { readLastRun } from '../lib/results-store.js';
import { getTestMeta } from '../lib/test-metadata.js';

export const listTestsSchema = z.object({
  status: z
    .enum(['passing', 'failing', 'pending', 'never_ran'])
    .optional()
    .describe('Filter by status. Omit to list all tests.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Max number of results (default: 20, max: 100)'),
});

export type ListTestsInput = z.infer<typeof listTestsSchema>;

export type TestStatus = 'passing' | 'failing' | 'pending' | 'never_ran';

export interface TestEntry {
  file: string;
  last_status: TestStatus;
  last_run_at?: string;
  enabled: boolean;
  validated: boolean;
  schedule?: string;
  name?: string;
  description?: string;
}

export function listTests(input: ListTestsInput = {}): TestEntry[] {
  if (!existsSync(TESTS_DIR)) return [];

  const files = readdirSync(TESTS_DIR).filter((f) => f.endsWith('.spec.ts'));
  const lastRun = readLastRun();
  const limit = input.limit ?? 20;

  const failedFiles = new Set(lastRun?.failures.map((f) => f.file) ?? []);

  let entries: TestEntry[] = files.map((file) => {
    const fullPath = join(TESTS_DIR, file);
    const meta = getTestMeta(file);
    let last_status: TestStatus = 'never_ran';

    if (lastRun) {
      last_status = failedFiles.has(fullPath) ? 'failing' : 'passing';
    }

    return {
      file,
      last_status,
      last_run_at: lastRun?.run_at,
      enabled: meta?.enabled ?? true,
      // Missing `validated` (tests saved before this field existed) counts
      // as already trusted — same grandfathering rule as the scheduler.
      validated: meta?.validated !== false,
      schedule: meta?.schedule,
      name: meta?.name,
      description: meta?.description,
    };
  });

  if (input.status) {
    const filter = input.status === 'pending' ? 'never_ran' : input.status;
    entries = entries.filter((e) => e.last_status === filter);
  }

  return entries.slice(0, limit);
}

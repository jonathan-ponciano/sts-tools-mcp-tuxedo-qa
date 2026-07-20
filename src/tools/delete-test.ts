import { unlinkSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { z } from 'zod';
import { testsDirFor, configDirFor, CURRENT_PROJECT } from '../lib/paths.js';
import { deleteTestMeta } from '../lib/test-metadata.js';

export const deleteTestSchema = z.object({
  name: z.string().describe('Test file name (with or without .spec.ts)'),
  confirm: z
    .boolean()
    .describe('Must be true to confirm deletion. Never pass true without explicit user confirmation.'),
});

export type DeleteTestInput = z.infer<typeof deleteTestSchema>;

export function deleteTest(input: DeleteTestInput, project?: string | null): string {
  const p = project !== undefined ? project : CURRENT_PROJECT;

  if (!input.confirm) {
    throw new Error('confirm must be true to delete a test. This action is irreversible — prefer update_test with enabled: false if you want to reactivate later.');
  }

  const safeName = basename(input.name).replace(/\.spec\.ts$/, '');
  const filePath = join(testsDirFor(p), `${safeName}.spec.ts`);

  if (!existsSync(filePath)) {
    throw new Error(`Test "${safeName}.spec.ts" not found.`);
  }

  unlinkSync(filePath);
  deleteTestMeta(`${safeName}.spec.ts`, configDirFor(p));
  return `Test "${safeName}.spec.ts" deleted permanently.`;
}

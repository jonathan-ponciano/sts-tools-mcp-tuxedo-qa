import { unlinkSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { z } from 'zod';
import { TESTS_DIR } from '../lib/paths.js';
import { deleteTestMeta } from '../lib/test-metadata.js';

export const deleteTestSchema = z.object({
  name: z.string().describe('Test file name (with or without .spec.ts)'),
  confirm: z
    .boolean()
    .describe('Must be true to confirm deletion. Never pass true without explicit user confirmation.'),
});

export type DeleteTestInput = z.infer<typeof deleteTestSchema>;

export function deleteTest(input: DeleteTestInput): string {
  if (!input.confirm) {
    throw new Error('confirm must be true to delete a test. This action is irreversible — prefer update_test with enabled: false if you want to reactivate later.');
  }

  const safeName = basename(input.name).replace(/\.spec\.ts$/, '');
  const filePath = join(TESTS_DIR, `${safeName}.spec.ts`);

  if (!existsSync(filePath)) {
    throw new Error(`Test "${safeName}.spec.ts" not found.`);
  }

  unlinkSync(filePath);
  deleteTestMeta(`${safeName}.spec.ts`);
  return `Test "${safeName}.spec.ts" deleted permanently.`;
}

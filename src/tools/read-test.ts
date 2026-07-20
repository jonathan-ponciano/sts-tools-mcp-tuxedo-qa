import { readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { z } from 'zod';
import { TESTS_DIR } from '../lib/paths.js';

export const readTestSchema = z.object({
  name: z.string().describe('Test file name (with or without .spec.ts)'),
});

export type ReadTestInput = z.infer<typeof readTestSchema>;

export function readTest(input: ReadTestInput): string {
  const safeName = basename(input.name).replace(/\.spec\.ts$/, '');
  const filePath = join(TESTS_DIR, `${safeName}.spec.ts`);

  if (!existsSync(filePath)) {
    throw new Error(`Test "${safeName}.spec.ts" not found.`);
  }

  return readFileSync(filePath, 'utf-8');
}

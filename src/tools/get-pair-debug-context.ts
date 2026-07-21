import { z } from 'zod';
import { getSessionSummary } from '../lib/pair-debug-session.js';

export const getPairDebugContextSchema = z.object({});

export type GetPairDebugContextInput = z.infer<typeof getPairDebugContextSchema>;

export function getPairDebugContext(): string {
  return getSessionSummary();
}

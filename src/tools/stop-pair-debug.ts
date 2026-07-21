import { z } from 'zod';
import { stopSession } from '../lib/pair-debug-session.js';

export const stopPairDebugSchema = z.object({});

export type StopPairDebugInput = z.infer<typeof stopPairDebugSchema>;

export async function stopPairDebug(): Promise<string> {
  return stopSession();
}

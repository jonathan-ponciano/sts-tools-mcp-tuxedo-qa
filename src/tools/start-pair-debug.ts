import { z } from 'zod';
import { startSession, isSessionActive } from '../lib/pair-debug-session.js';

export const startPairDebugSchema = z.object({
  url: z
    .string()
    .describe('URL to open in the visible browser — the flow entry point the human will drive by hand (e.g. the login page).'),
});

export type StartPairDebugInput = z.infer<typeof startPairDebugSchema>;

export async function startPairDebug(input: StartPairDebugInput): Promise<string> {
  if (isSessionActive()) {
    return 'A pair-debugging session is already running. Call stop_pair_debug first if you want to start a new one.';
  }

  await startSession(input.url);

  return [
    `Pair-debugging session started — a visible browser window opened at ${input.url}.`,
    "Now let the human follow the flow themselves (clicks, forms, navigation). Console messages, failed/erroring network requests, page exceptions, navigations, and their actions are all being recorded with timestamps.",
    'Call get_pair_debug_context at any point to see the timeline so far — use it to spot what went wrong as soon as the human reports something looks off.',
    "Call stop_pair_debug when they're done to get the full timeline plus a draft Playwright test of what they just did.",
  ].join('\n');
}

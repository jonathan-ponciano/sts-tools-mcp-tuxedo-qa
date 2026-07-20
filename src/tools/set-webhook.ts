import { z } from 'zod';
import { writeWebhook } from '../lib/webhook-store.js';
import { configDirFor, CURRENT_PROJECT } from '../lib/paths.js';

export const setWebhookSchema = z.object({
  url: z.string().url().describe('Discord webhook URL'),
  events: z
    .enum(['failure', 'all'])
    .default('failure')
    .describe('"failure" to notify only on failures, "all" to notify on every run'),
});

export type SetWebhookInput = z.infer<typeof setWebhookSchema>;

export function setWebhook(input: SetWebhookInput, project?: string | null): string {
  const p = project !== undefined ? project : CURRENT_PROJECT;
  writeWebhook(input, configDirFor(p));
  return `Webhook configured: ${input.url} (events: ${input.events})`;
}

import { writeFileSync, mkdirSync } from 'fs';
import { z } from 'zod';
import { WEBHOOK_CONFIG, CONFIG_DIR } from '../lib/paths.js';

export const setWebhookSchema = z.object({
  url: z.string().url().describe('Discord webhook URL'),
  events: z
    .enum(['failure', 'all'])
    .default('failure')
    .describe('"failure" to notify only on failures, "all" to notify on every run'),
});

export type SetWebhookInput = z.infer<typeof setWebhookSchema>;

export function setWebhook(input: SetWebhookInput): string {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(WEBHOOK_CONFIG, JSON.stringify(input, null, 2), 'utf-8');
  return `Webhook configured: ${input.url} (events: ${input.events})`;
}

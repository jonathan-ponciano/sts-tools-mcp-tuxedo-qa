import { z } from 'zod';
import { writeWebhook, detectPlatform } from '../lib/webhook-store.js';
import { configDirFor, CURRENT_PROJECT } from '../lib/paths.js';

export const setWebhookSchema = z.object({
  url: z.string().url().describe('Webhook URL — Discord, Slack incoming webhook, or any generic JSON endpoint'),
  events: z
    .enum(['failure', 'all'])
    .default('failure')
    .describe('"failure" to notify only on failures, "all" to notify on every run'),
  platform: z
    .enum(['discord', 'slack', 'generic'])
    .optional()
    .describe(
      'Webhook format. Auto-detected from the URL if omitted (discord.com/api/webhooks → discord, ' +
        'hooks.slack.com → slack, anything else → generic JSON POST of the run summary — useful for ' +
        'Teams/email/Zapier via an intermediary).',
    ),
});

export type SetWebhookInput = z.infer<typeof setWebhookSchema>;

export function setWebhook(input: SetWebhookInput, project?: string | null): string {
  const p = project !== undefined ? project : CURRENT_PROJECT;
  const platform = input.platform ?? detectPlatform(input.url);
  writeWebhook({ url: input.url, events: input.events, platform }, configDirFor(p));
  return `Webhook configured: ${input.url} (platform: ${platform}, events: ${input.events})`;
}

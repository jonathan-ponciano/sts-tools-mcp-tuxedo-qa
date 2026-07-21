import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { CONFIG_DIR } from './paths.js';
import { sendDiscordWebhook } from './discord-webhook.js';
import { sendSlackWebhook } from './slack-webhook.js';
import { sendGenericWebhook } from './generic-webhook.js';
import type { RunSummary } from './results-store.js';

export type WebhookPlatform = 'discord' | 'slack' | 'generic';

export interface WebhookConfig {
  url: string;
  events: 'failure' | 'all';
  platform: WebhookPlatform;
}

// Lets `set_webhook` work with just a URL for the common cases — only a
// generic JSON POST needs to be spelled out explicitly, since there's no URL
// shape to recognize it by.
export function detectPlatform(url: string): WebhookPlatform {
  if (/discord\.com\/api\/webhooks/i.test(url)) return 'discord';
  if (/hooks\.slack\.com/i.test(url)) return 'slack';
  return 'generic';
}

function webhookFile(configDir: string): string {
  return join(configDir, 'webhook.json');
}

export function readWebhook(configDir: string = CONFIG_DIR): WebhookConfig | null {
  const file = webhookFile(configDir);
  if (!existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, 'utf-8')) as Partial<WebhookConfig> & { url: string; events: 'failure' | 'all' };
  // Back-compat: webhooks saved before `platform` existed default to Discord,
  // since that was the only format supported at the time.
  return { platform: 'discord', ...raw };
}

export function writeWebhook(config: WebhookConfig, configDir: string = CONFIG_DIR): void {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(webhookFile(configDir), JSON.stringify(config, null, 2), 'utf-8');
}

const SENDERS: Record<WebhookPlatform, (url: string, summary: RunSummary) => Promise<void>> = {
  discord: sendDiscordWebhook,
  slack: sendSlackWebhook,
  generic: sendGenericWebhook,
};

// Single call site for "did a run just finish, and if so does it need to be
// announced" — used by both run_tests (manual/dashboard-triggered runs) and
// the scheduler (automatic runs), so the notify-on-failure-or-all logic and
// platform dispatch only exist in one place.
export async function notifyIfConfigured(configDir: string, summary: RunSummary | null): Promise<void> {
  const webhook = readWebhook(configDir);
  if (!webhook || !summary) return;
  const shouldNotify = webhook.events === 'all' || (webhook.events === 'failure' && summary.failed > 0);
  if (shouldNotify) await SENDERS[webhook.platform](webhook.url, summary).catch(() => {});
}

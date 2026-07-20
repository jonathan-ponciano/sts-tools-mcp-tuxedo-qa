import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { CONFIG_DIR } from './paths.js';

export interface WebhookConfig {
  url: string;
  events: 'failure' | 'all';
}

function webhookFile(configDir: string): string {
  return join(configDir, 'webhook.json');
}

export function readWebhook(configDir: string = CONFIG_DIR): WebhookConfig | null {
  const file = webhookFile(configDir);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf-8')) as WebhookConfig;
}

export function writeWebhook(config: WebhookConfig, configDir: string = CONFIG_DIR): void {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(webhookFile(configDir), JSON.stringify(config, null, 2), 'utf-8');
}

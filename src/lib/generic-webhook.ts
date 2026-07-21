import type { RunSummary } from './results-store.js';

// Escape hatch for anything that isn't Discord or Slack — Teams, email,
// Zapier/Make/n8n, or a custom internal endpoint. Posts the raw run summary
// as JSON; the receiving side decides how to format/route it.
export async function sendGenericWebhook(webhookUrl: string, summary: RunSummary): Promise<void> {
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(summary),
  });
}

import type { RunSummary } from './results-store.js';

// Slack incoming webhooks can't attach a local file the way Discord's
// multipart upload does (that needs a bot token + the files.upload API, not
// just a webhook URL) — screenshots are mentioned by path in the text
// instead of embedded as an image.
export async function sendSlackWebhook(webhookUrl: string, summary: RunSummary): Promise<void> {
  const hasFailures = summary.failures.length > 0;

  if (!hasFailures) {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `✅ *All tests passed* — ${summary.passed} passed, ${summary.skipped} skipped (${(summary.duration_ms / 1000).toFixed(1)}s)`,
      }),
    });
    return;
  }

  const lines = summary.failures.map((f) => {
    const shot = f.screenshot_path ? `\n    screenshot: ${f.screenshot_path}` : '';
    return `• *${f.test}* (\`${f.error_code}\`) — ${f.error.split('\n')[0]}${shot}`;
  });

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `🔴 *${summary.failed} test(s) failed* — ${new Date(summary.run_at).toLocaleString()}\n${lines.join('\n')}`,
    }),
  });
}

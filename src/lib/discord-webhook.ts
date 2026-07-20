import { readFileSync, existsSync } from 'fs';
import type { RunSummary, TestFailure } from './results-store.js';

const COLOR_FAIL = 0xe74c3c;
const COLOR_PASS = 0x2ecc71;

function buildEmbed(failure: TestFailure, screenshotIndex: number) {
  const embed: Record<string, unknown> = {
    title: `Test Failed: ${failure.test}`,
    color: COLOR_FAIL,
    fields: [
      {
        name: 'Error',
        value: failure.error.substring(0, 1024),
        inline: false,
      },
      { name: 'Code', value: failure.error_code, inline: true },
      {
        name: 'Duration',
        value: `${(failure.duration_ms / 1000).toFixed(1)}s`,
        inline: true,
      },
      { name: 'File', value: failure.file || 'unknown', inline: false },
    ],
    timestamp: new Date().toISOString(),
  };

  if (failure.screenshot_path && existsSync(failure.screenshot_path)) {
    embed.image = { url: `attachment://screenshot-${screenshotIndex}.png` };
  }

  return embed;
}

export async function sendDiscordWebhook(
  webhookUrl: string,
  summary: RunSummary,
): Promise<void> {
  const hasFailures = summary.failures.length > 0;

  if (!hasFailures) {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [
          {
            title: 'All tests passed',
            color: COLOR_PASS,
            fields: [
              { name: 'Passed', value: String(summary.passed), inline: true },
              { name: 'Skipped', value: String(summary.skipped), inline: true },
              {
                name: 'Duration',
                value: `${(summary.duration_ms / 1000).toFixed(1)}s`,
                inline: true,
              },
            ],
            timestamp: summary.run_at,
          },
        ],
      }),
    });
    return;
  }

  // Send one message per failure (Discord limit: 10 embeds, but screenshots
  // need to be matched 1-to-1 with files, so we batch 10 failures per request)
  const chunks: TestFailure[][] = [];
  for (let i = 0; i < summary.failures.length; i += 10) {
    chunks.push(summary.failures.slice(i, i + 10));
  }

  for (const chunk of chunks) {
    const form = new FormData();
    const embeds = chunk.map((f, i) => buildEmbed(f, i));

    chunk.forEach((failure, i) => {
      if (
        failure.screenshot_path &&
        existsSync(failure.screenshot_path)
      ) {
        const buf = readFileSync(failure.screenshot_path);
        const blob = new Blob([buf], { type: 'image/png' });
        form.append(`files[${i}]`, blob, `screenshot-${i}.png`);
      }
    });

    form.append(
      'payload_json',
      JSON.stringify({
        content: `**${summary.failed} test(s) failed** — ${new Date(summary.run_at).toLocaleString()}`,
        embeds,
      }),
    );

    await fetch(webhookUrl, { method: 'POST', body: form });
  }
}

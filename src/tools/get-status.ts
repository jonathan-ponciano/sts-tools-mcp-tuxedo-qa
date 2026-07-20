import { z } from 'zod';
import { readLastRun, type TestFailure } from '../lib/results-store.js';
import { getTestMeta } from '../lib/test-metadata.js';
import { basename } from 'path';

export const getStatusSchema = z.object({
  test_name: z
    .string()
    .optional()
    .describe('Test file name to get per-test status. Omit for overall suite status.'),
});

export type GetStatusInput = z.infer<typeof getStatusSchema>;

function suggestedFixPrompt(failure: TestFailure, filename: string): string {
  const err = failure.error;

  switch (failure.error_code) {
    case 'TIMEOUT':
      return (
        `Read "${filename}". The test timed out — likely a selector that never appeared or a navigation that stalled. ` +
        `Look for page.click / page.fill / expect calls without explicit timeouts and add { timeout: 60000 }. ` +
        `Also consider replacing fixed waits with waitForSelector or waitForURL.`
      );

    case 'ASSERTION_FAILED':
      if (/toHaveURL/i.test(err)) {
        return (
          `Read "${filename}". The URL assertion failed — the page probably redirected somewhere unexpected. ` +
          `Add await page.waitForURL(...) before the expect, or relax the matcher to a regex: expect(page).toHaveURL(/partial-path/i).`
        );
      }
      if (/toHaveText|toContainText/i.test(err)) {
        return (
          `Read "${filename}". A text assertion failed — the element may not be visible yet or the copy changed. ` +
          `Use await expect(locator).toBeVisible() first, then check the exact text with page.locator(...).innerText().`
        );
      }
      return (
        `Read "${filename}". An assertion failed. ` +
        `Run page.locator('<selector>').count() to confirm the element exists, then inspect its actual value before asserting.`
      );

    case 'NAVIGATION_ERROR':
      return (
        `Read "${filename}". Navigation failed — the URL may be wrong, the server may be down, or there's a redirect loop. ` +
        `Verify the baseUrl is reachable, add await page.waitForLoadState('networkidle') after page.goto, ` +
        `and check for net:: errors in the failure message: "${err.split('\n')[0]}".`
      );

    default:
      return (
        `Read "${filename}", inspect the error below, and fix the failing step:\n` +
        `"${err.split('\n')[0]}"`
      );
  }
}

export function getStatus(input: GetStatusInput = {}): string {
  const summary = readLastRun();

  if (!summary) {
    return 'No test runs found. Use run_tests to execute the test suite.';
  }

  if (input.test_name) {
    const safeName = basename(input.test_name).replace(/\.spec\.ts$/, '');
    const filename = `${safeName}.spec.ts`;
    const meta = getTestMeta(filename);

    const failure = summary.failures.find((f) => basename(f.file) === filename);
    const status = failure ? 'FAILING' : 'PASSING';

    const lines = [
      `Test: ${filename}`,
      `Status: ${status}`,
      `Last run: ${summary.run_at}`,
    ];

    if (meta?.schedule) lines.push(`Schedule: every ${meta.schedule}`);
    if (meta?.tags?.length) lines.push(`Tags: ${meta.tags.join(', ')}`);
    if (meta?.enabled === false) lines.push('State: DISABLED');

    if (failure) {
      lines.push('');
      lines.push(`Error [${failure.error_code}]: ${failure.error.split('\n')[0]}`);
      lines.push(`Duration: ${(failure.duration_ms / 1000).toFixed(1)}s`);
      if (failure.screenshot_path) lines.push(`Screenshot: ${failure.screenshot_path}`);
      lines.push('');
      lines.push(`suggestedFixPrompt: ${suggestedFixPrompt(failure, filename)}`);
    }

    return lines.join('\n');
  }

  // overall suite status
  const overall = summary.failed === 0 ? 'PASSING' : 'FAILING';
  const lines = [
    `Status: ${overall}`,
    `Last run: ${summary.run_at}`,
    `Passed: ${summary.passed} | Failed: ${summary.failed} | Skipped: ${summary.skipped}`,
    `Duration: ${(summary.duration_ms / 1000).toFixed(1)}s`,
  ];

  if (summary.failures.length > 0) {
    lines.push('', 'Failing tests:');
    for (const f of summary.failures) {
      lines.push(`  [${f.error_code}] ${f.test} (${basename(f.file)})`);
      lines.push(`    ${f.error.split('\n')[0]}`);
    }
    lines.push('', 'Tip: call get_status with test_name to get a fix suggestion per test.');
  }

  return lines.join('\n');
}

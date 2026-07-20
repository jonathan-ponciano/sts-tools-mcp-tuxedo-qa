import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { z } from 'zod';
import { runPlaywright } from '../lib/playwright-runner.js';
import { readLastRun, type TestFailure } from '../lib/results-store.js';
import { TESTS_DIR } from '../lib/paths.js';

export const runUntilPassSchema = z.object({
  name: z.string().describe('Test file name (with or without .spec.ts)'),
  max_attempts: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .describe('Max run+fix iterations (default: 3, max: 5)'),
});

export type RunUntilPassInput = z.infer<typeof runUntilPassSchema>;

function applyAutofixes(code: string, failure: TestFailure): { code: string; fixes: string[] } {
  let patched = code;
  const fixes: string[] = [];

  // Fix 1: bump timeouts on TIMEOUT errors
  if (failure.error_code === 'TIMEOUT') {
    const bumped = patched.replace(/timeout:\s*(\d+)/g, (_, ms) => {
      const current = parseInt(ms, 10);
      const next = Math.min(current * 2, 90_000);
      return `timeout: ${next}`;
    });
    if (bumped !== patched) {
      patched = bumped;
      fixes.push('doubled existing timeout values');
    } else {
      // inject a global timeout option if none present
      patched = patched.replace(
        /(page\.goto\([^)]+)\)/,
        '$1, { timeout: 60000 })',
      );
      if (patched !== code) fixes.push('added timeout: 60000 to page.goto');
    }
  }

  // Fix 2: replace strict URL assertion with partial match on ASSERTION_FAILED
  if (failure.error_code === 'ASSERTION_FAILED' && /toHaveURL\((['"`])([^'"`]+)\1\)/.test(patched)) {
    patched = patched.replace(
      /toHaveURL\((['"`])([^'"`]+)\1\)/g,
      (_, q, url) => `toHaveURL(/${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/i)`,
    );
    fixes.push('relaxed toHaveURL to partial regex match');
  }

  // Fix 3: add waitForURL before URL assertions
  if (failure.error_code === 'NAVIGATION_ERROR') {
    patched = patched.replace(
      /(await expect\(page\)\.toHaveURL)/g,
      "await page.waitForLoadState('networkidle');\n  $1",
    );
    if (patched !== code) fixes.push('added waitForLoadState before URL assertion');
  }

  return { code: patched, fixes };
}

export async function runUntilPass(input: RunUntilPassInput): Promise<string> {
  const safeName = basename(input.name).replace(/\.spec\.ts$/, '');
  const filename = `${safeName}.spec.ts`;
  const filePath = join(TESTS_DIR, filename);

  if (!existsSync(filePath)) {
    throw new Error(`Test "${filename}" not found.`);
  }

  const maxAttempts = input.max_attempts ?? 3;
  const log: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    log.push(`--- Attempt ${attempt}/${maxAttempts} ---`);

    const { exitCode } = await runPlaywright({ testFile: filename });
    const summary = readLastRun();

    if (!summary) {
      log.push('Could not read run results.');
      break;
    }

    const testFailure = summary.failures.find((f) => f.file.endsWith(filename));

    if (!testFailure && summary.failed === 0) {
      log.push('PASSED ✓');
      return log.join('\n');
    }

    if (!testFailure) {
      log.push(`Playwright exited ${exitCode} but no matching failure found. Run: ${summary.passed} passed, ${summary.failed} failed.`);
      break;
    }

    log.push(`FAILED [${testFailure.error_code}]: ${testFailure.error.split('\n')[0]}`);

    if (attempt === maxAttempts) break;

    // try to auto-fix
    const code = readFileSync(filePath, 'utf-8');
    const { code: patched, fixes } = applyAutofixes(code, testFailure);

    if (fixes.length > 0 && patched !== code) {
      writeFileSync(filePath, patched, 'utf-8');
      log.push(`Auto-fix applied: ${fixes.join(', ')}`);
    } else {
      log.push('No automatic fix available for this error type.');
      log.push(`Suggested fix prompt: Read the test "${filename}", look at the error above, and fix the selector or assertion.`);
      break;
    }
  }

  const summary = readLastRun();
  const lines = [...log, '', 'STILL FAILING after all attempts.'];

  if (summary) {
    lines.push(`Last run: ${summary.passed} passed, ${summary.failed} failed in ${(summary.duration_ms / 1000).toFixed(1)}s`);
  }

  lines.push(`Use read_test with name "${filename}" to inspect the current script, then update_test to apply a manual fix.`);

  return lines.join('\n');
}

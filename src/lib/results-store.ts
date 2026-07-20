import { readFileSync, existsSync } from 'fs';
import { LAST_RUN } from './paths.js';

export interface TestFailure {
  test: string;
  file: string;
  error: string;
  error_code: string;
  screenshot_path?: string;
  duration_ms: number;
}

export interface RunSummary {
  run_at: string;
  duration_ms: number;
  passed: number;
  failed: number;
  skipped: number;
  failures: TestFailure[];
}

// Playwright JSON reporter output types (relevant subset)
interface PWAttachment {
  name: string;
  contentType: string;
  path?: string;
}

interface PWTestResult {
  status: string;
  duration: number;
  error?: { message: string; stack?: string };
  attachments: PWAttachment[];
}

interface PWTest {
  status: string;
  results: PWTestResult[];
}

interface PWSpec {
  title: string;
  ok: boolean;
  tests: PWTest[];
}

interface PWSuite {
  title: string;
  file?: string;
  suites?: PWSuite[];
  specs?: PWSpec[];
}

interface PWReport {
  stats: {
    expected: number;
    unexpected: number;
    skipped: number;
    duration: number;
    startTime: string;
  };
  suites: PWSuite[];
}

function deriveErrorCode(message: string): string {
  if (/TimeoutError|exceeded \d+ms/i.test(message)) return 'TIMEOUT';
  if (/net::ERR_[A-Z_]+/.test(message)) {
    const match = message.match(/net::(ERR_[A-Z_]+)/);
    return match ? match[1] : 'NAVIGATION_ERROR';
  }
  if (/navigation|page\.goto|ERR_/i.test(message)) return 'NAVIGATION_ERROR';
  if (/expect\(|toBe|toEqual|toHave|toContain/i.test(message)) return 'ASSERTION_FAILED';
  return 'UNKNOWN';
}

function collectFailures(suites: PWSuite[], parentFile = ''): TestFailure[] {
  const failures: TestFailure[] = [];

  for (const suite of suites) {
    const file = suite.file ?? parentFile;

    if (suite.suites) {
      failures.push(...collectFailures(suite.suites, file));
    }

    for (const spec of suite.specs ?? []) {
      if (spec.ok) continue;

      for (const test of spec.tests) {
        for (const result of test.results) {
          if (result.status === 'passed') continue;

          const error = result.error?.message ?? 'Unknown error';
          const screenshot = result.attachments.find(
            (a) => a.name === 'screenshot' && a.path,
          );

          failures.push({
            test: spec.title,
            file,
            error,
            error_code: deriveErrorCode(error),
            screenshot_path: screenshot?.path,
            duration_ms: result.duration,
          });
        }
      }
    }
  }

  return failures;
}

export function readLastRun(): RunSummary | null {
  if (!existsSync(LAST_RUN)) return null;

  const raw = readFileSync(LAST_RUN, 'utf-8');
  const report: PWReport = JSON.parse(raw);

  return {
    run_at: report.stats.startTime,
    duration_ms: report.stats.duration,
    passed: report.stats.expected,
    failed: report.stats.unexpected,
    skipped: report.stats.skipped,
    failures: collectFailures(report.suites),
  };
}

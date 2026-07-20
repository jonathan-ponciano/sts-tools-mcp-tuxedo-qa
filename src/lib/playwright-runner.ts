import { spawn } from 'child_process';
import { mkdirSync } from 'fs';
import { ROOT, CURRENT_PROJECT, configDirFor, resultsDirFor, lastRunFor } from './paths.js';
import { readCredentials } from './credentials-store.js';
import { readProtection, buildExtraHeaders } from './protection-store.js';
import { appendHistory } from './run-history.js';
import { readLastRun } from './results-store.js';

export interface RunOptions {
  testFile?: string;
  credentialLabel?: string;
  // Which project's tests/config/results to use. Defaults to this process's
  // own TUXEDO_QA_PROJECT — the scheduler overrides it per-project since one
  // dashboard process checks every project's schedule, not just its own.
  project?: string | null;
}

export interface RunResult {
  exitCode: number;
  output: string;
}

// Playwright writes a single shared results/last-run.json per invocation, so
// overlapping runs (manual + scheduled, or two scheduled tests at once) would
// race and corrupt each other's report. Serialize all runs through one queue.
let queue: Promise<unknown> = Promise.resolve();

export function runPlaywright(opts: RunOptions = {}): Promise<RunResult> {
  const run = () => runPlaywrightNow(opts);
  const result = queue.then(run, run);
  queue = result.then(() => undefined, () => undefined);
  return result;
}

async function runPlaywrightNow(opts: RunOptions = {}): Promise<RunResult> {
  const project = opts.project !== undefined ? opts.project : CURRENT_PROJECT;
  const configDir = configDirFor(project);
  const resultsDir = resultsDirFor(project);

  mkdirSync(resultsDir, { recursive: true });

  const args = ['playwright', 'test'];
  if (opts.testFile) args.push(opts.testFile);

  const extraEnv: Record<string, string> = { TUXEDO_IS_TEST_RUN: 'true' };
  if (project) extraEnv.TUXEDO_QA_PROJECT = project;

  if (opts.credentialLabel) {
    const all = readCredentials(configDir);
    const set = all[opts.credentialLabel];
    if (set) extraEnv.TUXEDO_CREDENTIALS = JSON.stringify(set);
  }

  const protection = readProtection(configDir);
  const extraHeaders = buildExtraHeaders(protection);
  if (Object.keys(extraHeaders).length > 0) {
    extraEnv.TUXEDO_EXTRA_HEADERS = JSON.stringify(extraHeaders);
  }

  return new Promise((resolve) => {
    const output: string[] = [];

    const proc = spawn('npx', args, {
      cwd: ROOT,
      env: { ...process.env, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.stdout.on('data', (d: Buffer) => output.push(d.toString()));
    proc.stderr.on('data', (d: Buffer) => output.push(d.toString()));

    proc.on('close', (code) => {
      const summary = readLastRun(lastRunFor(project));
      if (summary) appendHistory(summary, configDir);
      resolve({ exitCode: code ?? 1, output: output.join('') });
    });
  });
}

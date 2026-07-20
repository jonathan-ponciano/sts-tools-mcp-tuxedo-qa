import { spawn } from 'child_process';
import { mkdirSync } from 'fs';
import { ROOT, RESULTS_DIR } from './paths.js';
import { readCredentials } from './credentials-store.js';
import { readProtection, buildExtraHeaders } from './protection-store.js';
import { appendHistory } from './run-history.js';
import { readLastRun } from './results-store.js';

export interface RunOptions {
  testFile?: string;
  credentialLabel?: string;
}

export interface RunResult {
  exitCode: number;
  output: string;
}

export async function runPlaywright(opts: RunOptions = {}): Promise<RunResult> {
  mkdirSync(RESULTS_DIR, { recursive: true });

  const args = ['playwright', 'test'];
  if (opts.testFile) args.push(opts.testFile);

  const extraEnv: Record<string, string> = { TUXEDO_IS_TEST_RUN: 'true' };

  if (opts.credentialLabel) {
    const all = readCredentials();
    const set = all[opts.credentialLabel];
    if (set) extraEnv.TUXEDO_CREDENTIALS = JSON.stringify(set);
  }

  const protection = readProtection();
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
      const summary = readLastRun();
      if (summary) appendHistory(summary);
      resolve({ exitCode: code ?? 1, output: output.join('') });
    });
  });
}

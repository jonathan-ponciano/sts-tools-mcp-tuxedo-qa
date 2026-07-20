import { existsSync, readdirSync } from 'fs';
import { TESTS_DIR } from './paths.js';
import { getAllMeta, type TestMeta } from './test-metadata.js';
import { isTestsPaused } from '../tools/pause-tests.js';
import { runTests } from '../tools/run-tests.js';

const SCHEDULE_MS: Record<NonNullable<TestMeta['schedule']>, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

const CHECK_INTERVAL_MS = 60 * 1000;

const running = new Set<string>();
let lastCheckedAt: string | null = null;
let started = false;

export function nextRunAt(meta: TestMeta): string | null {
  if (!meta.schedule || meta.enabled === false) return null;
  const intervalMs = SCHEDULE_MS[meta.schedule];
  const last = meta.last_run_at ? new Date(meta.last_run_at).getTime() : 0;
  return new Date(last + intervalMs).toISOString();
}

function isDue(meta: TestMeta): boolean {
  const next = nextRunAt(meta);
  return next !== null && Date.now() >= new Date(next).getTime();
}

async function checkDueTests(): Promise<void> {
  lastCheckedAt = new Date().toISOString();

  if (isTestsPaused().paused) return;
  if (!existsSync(TESTS_DIR)) return;

  const files = readdirSync(TESTS_DIR).filter((f) => f.endsWith('.spec.ts'));
  const meta = getAllMeta();

  for (const file of files) {
    const m = meta[file];
    if (!m || !isDue(m) || running.has(file)) continue;

    running.add(file);
    try {
      await runTests({ test_file: file, wait_for_result: true });
    } catch {
      // failure is already captured in run history / Discord notification
    } finally {
      running.delete(file);
    }
  }
}

export function startScheduler(): void {
  if (started) return;
  started = true;
  setInterval(() => { checkDueTests().catch(() => {}); }, CHECK_INTERVAL_MS);
  checkDueTests().catch(() => {});
}

export function getSchedulerState(): { active: boolean; running: string[]; lastCheckedAt: string | null } {
  return { active: started, running: [...running], lastCheckedAt };
}

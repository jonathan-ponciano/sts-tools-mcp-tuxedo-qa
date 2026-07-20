import { existsSync, readdirSync } from 'fs';
import { basename } from 'path';
import {
  listProjectSlugs,
  hasDefaultProjectData,
  testsDirFor,
  configDirFor,
  lastRunFor,
} from './paths.js';
import { getAllMeta, upsertTestMeta, type TestMeta } from './test-metadata.js';
import { isTestsPaused } from '../tools/pause-tests.js';
import { runPlaywright } from './playwright-runner.js';
import { readLastRun } from './results-store.js';
import { sendDiscordWebhook } from './discord-webhook.js';
import { readWebhook } from './webhook-store.js';

const SCHEDULE_MS: Record<NonNullable<TestMeta['schedule']>, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

const CHECK_INTERVAL_MS = 60 * 1000;

interface RunningEntry {
  project: string | null;
  file: string;
}

const running: RunningEntry[] = [];
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

function isRunning(project: string | null, file: string): boolean {
  return running.some((r) => r.project === project && r.file === file);
}

// Every project ever created, whether under projects/<slug>/ or the
// unnamespaced install root (single-project installs, unaffected by
// TUXEDO_QA_PROJECT). `null` represents that unnamespaced default project.
function allProjectSlugs(): (string | null)[] {
  const slugs: (string | null)[] = listProjectSlugs();
  if (hasDefaultProjectData()) slugs.push(null);
  return slugs;
}

async function runDueTest(project: string | null, file: string): Promise<void> {
  const configDir = configDirFor(project);
  running.push({ project, file });
  try {
    const { credential } = getAllMeta(configDir)[file] ?? {};
    await runPlaywright({ testFile: file, credentialLabel: credential, project });
    const summary = readLastRun(lastRunFor(project));
    upsertTestMeta(file, { last_run_at: summary?.run_at ?? new Date().toISOString() }, configDir);

    const webhook = readWebhook(configDir);
    if (webhook && summary) {
      const shouldNotify = webhook.events === 'all' || (webhook.events === 'failure' && summary.failed > 0);
      if (shouldNotify) await sendDiscordWebhook(webhook.url, summary).catch(() => {});
    }
  } catch {
    // a spawn failure here just means this test stays "due" and gets
    // retried on the next check — nothing to record.
  } finally {
    const idx = running.findIndex((r) => r.project === project && r.file === file);
    if (idx !== -1) running.splice(idx, 1);
  }
}

async function checkDueTests(): Promise<void> {
  lastCheckedAt = new Date().toISOString();

  for (const project of allProjectSlugs()) {
    if (isTestsPaused(configDirFor(project)).paused) continue;

    const testsDir = testsDirFor(project);
    if (!existsSync(testsDir)) continue;

    const files = readdirSync(testsDir).filter((f) => f.endsWith('.spec.ts'));
    const meta = getAllMeta(configDirFor(project));

    for (const file of files) {
      const m = meta[file];
      if (!m || !isDue(m) || isRunning(project, file)) continue;
      await runDueTest(project, basename(file));
    }
  }
}

export function startScheduler(): void {
  if (started) return;
  started = true;
  setInterval(() => { checkDueTests().catch(() => {}); }, CHECK_INTERVAL_MS);
  checkDueTests().catch(() => {});
}

export function getSchedulerState(): { active: boolean; running: RunningEntry[]; lastCheckedAt: string | null } {
  return { active: started, running: [...running], lastCheckedAt };
}

import express from 'express';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync, readdirSync } from 'fs';

import { createTest } from './tools/create-test.js';
import { updateTest } from './tools/update-test.js';
import { deleteTest } from './tools/delete-test.js';
import { runTests } from './tools/run-tests.js';
import { createCredential } from './tools/create-credential.js';
import { deleteCredential } from './tools/delete-credential.js';

import { readLastRun } from './lib/results-store.js';
import { getAllMeta, getTestMeta } from './lib/test-metadata.js';
import { readCredentials, maskValue } from './lib/credentials-store.js';
import { readProtection, writeProtection } from './lib/protection-store.js';
import { readStatusPage, writeStatusPage } from './lib/status-page-store.js';
import { readHistory, computeUptime } from './lib/run-history.js';
import { TESTS_DIR } from './lib/paths.js';
import { startScheduler, getSchedulerState, nextRunAt } from './lib/scheduler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DASHBOARD = join(__dirname, '..', 'dashboard', 'index.html');
const PORT = Number(process.env.PORT ?? 3131);

const app = express();
app.use(express.json());
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  next();
});
app.options(/\/.*/, (_req, res) => res.sendStatus(204));

// ── Dashboard ─────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  if (!existsSync(DASHBOARD)) return res.status(404).send('Dashboard not found. Create dashboard/index.html');
  res.sendFile(DASHBOARD);
});

// ── Status ─────────────────────────────────────────────────────────────────────
app.get('/api/status', (_req, res) => {
  const lastRun = readLastRun();
  res.json({ lastRun });
});

// ── Tests ─────────────────────────────────────────────────────────────────────
app.get('/api/tests', (_req, res) => {
  const meta = getAllMeta();
  const files = existsSync(TESTS_DIR)
    ? readdirSync(TESTS_DIR).filter((f) => f.endsWith('.spec.ts'))
    : [];

  const lastRun = readLastRun();
  const failedFiles = new Set((lastRun?.failures ?? []).map((f) => basename(f.file)));

  const scheduler = getSchedulerState();

  const tests = files.map((filename) => {
    const m = meta[filename] ?? { enabled: true };
    const status = !m.enabled
      ? 'disabled'
      : failedFiles.has(filename)
      ? 'failing'
      : lastRun
      ? 'passing'
      : 'never_ran';
    return {
      filename,
      status,
      ...m,
      next_run_at: nextRunAt(m as Parameters<typeof nextRunAt>[0]),
      running: scheduler.running.includes(filename),
    };
  });

  res.json({ tests });
});

// ── Scheduler / monitor ──────────────────────────────────────────────────────
app.get('/api/scheduler', (_req, res) => {
  res.json(getSchedulerState());
});

app.get('/api/tests/:name', (req, res) => {
  const safeName = basename(req.params.name).replace(/\.spec\.ts$/, '');
  const filename = `${safeName}.spec.ts`;
  const filePath = join(TESTS_DIR, filename);

  if (!existsSync(filePath)) return res.status(404).json({ error: 'Test not found.' });

  const code = readFileSync(filePath, 'utf-8');
  const meta = getTestMeta(filename) ?? { enabled: true };
  const lastRun = readLastRun();
  const failure = lastRun?.failures.find((f) => basename(f.file) === filename) ?? null;

  res.json({ filename, code, meta, failure });
});

app.post('/api/tests', async (req, res) => {
  try {
    const result = await createTest(req.body);
    res.json({ message: result });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

app.put('/api/tests/:name', (req, res) => {
  try {
    const result = updateTest({ name: req.params.name, ...req.body });
    res.json({ message: result });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

app.delete('/api/tests/:name', async (req, res) => {
  try {
    const result = await deleteTest({ name: req.params.name, confirm: true });
    res.json({ message: result });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

app.post('/api/tests/:name/run', async (req, res) => {
  try {
    const message = await runTests({ test_file: req.params.name, wait_for_result: true });
    res.json({ message, lastRun: readLastRun() });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post('/api/run-all', async (_req, res) => {
  try {
    const message = await runTests({ wait_for_result: true });
    res.json({ message, lastRun: readLastRun() });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── Credentials ────────────────────────────────────────────────────────────────
app.get('/api/credentials', (_req, res) => {
  const all = readCredentials();
  const credentials = Object.entries(all).map(([name, fields]) => ({
    name,
    fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, maskValue(v)])),
  }));
  res.json({ credentials });
});

app.post('/api/credentials', async (req, res) => {
  try {
    const { name, fields } = req.body as { name: string; fields: Record<string, string> };
    const result = await createCredential({ name, fields });
    res.json({ message: result });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

app.delete('/api/credentials/:name', async (req, res) => {
  try {
    const result = await deleteCredential({ name: req.params.name });
    res.json({ message: result });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// ── Protection ────────────────────────────────────────────────────────────────
app.get('/api/protection', (_req, res) => {
  const config = readProtection();
  // mask values for display
  const masked = Object.fromEntries(
    Object.entries(config.extraHeaders).map(([k, v]) => [k, maskValue(v)]),
  );
  res.json({ extraHeaders: masked });
});

app.put('/api/protection', (req, res) => {
  try {
    const { extraHeaders } = req.body as { extraHeaders: Record<string, string> };
    writeProtection({ extraHeaders: extraHeaders ?? {} });
    res.json({ message: 'Protection config saved.' });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// ── Status page config ────────────────────────────────────────────────────────
app.get('/api/status-page', (_req, res) => {
  res.json(readStatusPage());
});

app.put('/api/status-page', (req, res) => {
  try {
    writeStatusPage(req.body);
    res.json({ message: 'Status page config saved.' });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// ── History ───────────────────────────────────────────────────────────────────
app.get('/api/history', (_req, res) => {
  const history = readHistory();
  const uptime = computeUptime(history);
  res.json({ history: history.slice(0, 60), uptime });
});

// ── Public status page ────────────────────────────────────────────────────────
app.get('/status/:slug', (req, res) => {
  const cfg = readStatusPage();
  if (!cfg.enabled || cfg.slug !== req.params.slug) return res.status(404).send('Status page not found.');

  const lastRun = readLastRun();
  const history = readHistory();
  const uptime = computeUptime(history);
  const meta = getAllMeta();
  const failedFiles = new Set((lastRun?.failures ?? []).map((f) => basename(f.file)));

  const tests = cfg.tests.map((filename) => {
    const m = meta[filename] ?? { enabled: true };
    const status = !m.enabled ? 'disabled' : failedFiles.has(filename) ? 'failing' : lastRun ? 'passing' : 'pending';
    return { filename, status };
  });

  const last60 = history.slice(0, 60).map((e) => ({ run_at: e.run_at, ok: e.failed === 0 }));

  res.send(renderStatusPage({ name: cfg.name, tests, uptime, last60 }));
});

function renderStatusPage({ name, tests, uptime, last60 }: {
  name: string;
  tests: { filename: string; status: string }[];
  uptime: number;
  last60: { run_at: string; ok: boolean }[];
}): string {
  const statusColor: Record<string, string> = {
    passing: '#22c55e', failing: '#ef4444', pending: '#eab308', disabled: '#9ca3af',
  };
  const rows = tests.map(t => `
    <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #f3f4f6;">
      <span style="width:10px;height:10px;border-radius:50%;background:${statusColor[t.status] ?? '#9ca3af'};flex-shrink:0;"></span>
      <span style="font-size:14px;color:#374151;">${t.filename}</span>
      <span style="margin-left:auto;font-size:12px;color:#6b7280;text-transform:uppercase;">${t.status}</span>
    </div>`).join('');

  const bars = last60.map(e => {
    const tip = new Date(e.run_at).toLocaleString();
    return `<span title="${tip}" style="display:inline-block;width:8px;height:28px;border-radius:2px;background:${e.ok ? '#22c55e' : '#ef4444'};margin-right:2px;"></span>`;
  }).join('');

  const overall = tests.every(t => t.status === 'passing') ? 'Operacional' : tests.some(t => t.status === 'failing') ? 'Com falhas' : 'Parcial';
  const overallColor = overall === 'Operacional' ? '#22c55e' : '#ef4444';

  return `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${name}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;color:#111827;padding:40px 20px}
  .card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;max-width:640px;margin:0 auto 20px}
  h1{font-size:22px;font-weight:700;margin-bottom:4px}
  .sub{font-size:13px;color:#6b7280}
</style>
</head><body>
<div style="max-width:640px;margin:0 auto">
  <h1 style="margin-bottom:24px">${name}</h1>
  <div class="card">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <span style="width:12px;height:12px;border-radius:50%;background:${overallColor}"></span>
      <span style="font-weight:600">${overall}</span>
      <span style="margin-left:auto;font-size:13px;color:#6b7280">Uptime 30d: ${uptime}%</span>
    </div>
    ${rows}
  </div>
  ${last60.length ? `<div class="card"><p style="font-size:12px;color:#6b7280;margin-bottom:10px">Últimas ${last60.length} execuções</p><div>${bars}</div></div>` : ''}
  <p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:16px">powered by tuxedo-qa</p>
</div>
</body></html>`;
}

app.listen(PORT, () => {
  console.log(`\ntuxedo-qa dashboard → http://localhost:${PORT}\n`);
  startScheduler();
  console.log('Scheduler active — checks every minute for tests due to run.\n');
});

import express from 'express';
import { join, dirname, basename, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync, readdirSync, mkdirSync, rmSync } from 'fs';

import { createTest } from './tools/create-test.js';
import { updateTest } from './tools/update-test.js';
import { deleteTest } from './tools/delete-test.js';
import { runTests } from './tools/run-tests.js';
import { createCredential } from './tools/create-credential.js';
import { deleteCredential } from './tools/delete-credential.js';
import { setWebhook } from './tools/set-webhook.js';

import { readLastRun } from './lib/results-store.js';
import { getAllMeta, getTestMeta } from './lib/test-metadata.js';
import { readCredentials, maskValue } from './lib/credentials-store.js';
import { readCredentialRequests, resolveCredentialRequest } from './lib/credential-requests-store.js';
import { readProtection, writeProtection } from './lib/protection-store.js';
import { readStatusPage, writeStatusPage } from './lib/status-page-store.js';
import { readWebhook } from './lib/webhook-store.js';
import { readHistory, computeUptime } from './lib/run-history.js';
import {
  listProjectSlugs,
  hasDefaultProjectData,
  namespaceFor,
  testsDirFor,
  configDirFor,
  resultsDirFor,
  lastRunFor,
  lastRunLogFor,
  ensureProjectReady,
  ROOT,
  PROJECTS_DIR,
} from './lib/paths.js';
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

// The dashboard manages every project from one process — unlike an MCP
// connection (always scoped to a single project via its own env var), each
// request says which project it's about via ?project= (GET) or body.project
// (POST/PUT/DELETE). Empty/absent means the unnamespaced default project.
function projectFrom(req: express.Request): string | null {
  const raw = (req.query.project as string | undefined) ?? (req.body as { project?: string })?.project;
  return raw && raw.length > 0 ? raw : null;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  if (!existsSync(DASHBOARD)) return res.status(404).send('Dashboard not found. Create dashboard/index.html');
  res.sendFile(DASHBOARD);
});

// ── Projects ──────────────────────────────────────────────────────────────────
app.get('/api/projects', (_req, res) => {
  const slugs: (string | null)[] = listProjectSlugs();
  if (hasDefaultProjectData()) slugs.push(null);

  const scheduler = getSchedulerState();

  const projects = slugs.map((slug) => {
    const configDir = configDirFor(slug);
    const testsDir = testsDirFor(slug);
    const testCount = existsSync(testsDir)
      ? readdirSync(testsDir).filter((f) => f.endsWith('.spec.ts')).length
      : 0;
    const history = readHistory(configDir);
    return {
      project: slug,
      label: slug ?? 'padrão',
      testCount,
      uptime: computeUptime(history),
      running: scheduler.running.filter((r) => r.project === slug).length,
    };
  });

  res.json({ projects });
});

// Prepares an empty project namespace so it appears in the dashboard and can
// be managed (tests, credentials, schedule) right away — from here alone,
// with no MCP connection required. Registering an actual MCP connection for
// it (so it can be driven from a chat) is a separate, CLI-level step:
// TUXEDO_QA_PROJECT=<slug> bash install.sh.
app.post('/api/projects', (req, res) => {
  const { slug } = req.body as { slug?: string };
  if (!slug || !/^[a-zA-Z0-9_-]+$/.test(slug)) {
    return res.status(400).json({ error: 'Slug inválido — use apenas letras, números, "-" ou "_".' });
  }
  if (listProjectSlugs().includes(slug)) {
    return res.status(400).json({ error: `Projeto "${slug}" já existe.` });
  }
  ensureProjectReady(slug);
  mkdirSync(configDirFor(slug), { recursive: true });
  mkdirSync(resultsDirFor(slug), { recursive: true });
  res.json({ message: `Projeto "${slug}" criado.` });
});

// Irreversible — deletes every test/credential/history for that project.
// Does not touch any MCP registration; remove that separately with
// `claude mcp remove tuxedoqa-<slug>` (or the Gemini CLI equivalent) if
// you no longer want the connection either.
app.delete('/api/projects/:slug', (req, res) => {
  const { slug } = req.params;
  if (!listProjectSlugs().includes(slug)) {
    return res.status(404).json({ error: `Projeto "${slug}" não encontrado.` });
  }
  rmSync(namespaceFor(slug), { recursive: true, force: true });
  res.json({ message: `Projeto "${slug}" e todos os seus dados foram apagados.` });
});

// ── Webhook ───────────────────────────────────────────────────────────────────
app.get('/api/webhook', (req, res) => {
  const webhook = readWebhook(configDirFor(projectFrom(req)));
  if (!webhook) return res.json({ url: null, events: 'failure', platform: 'discord' });
  res.json({ url: maskValue(webhook.url), events: webhook.events, platform: webhook.platform });
});

app.put('/api/webhook', (req, res) => {
  try {
    const { url, events, platform } = req.body as {
      url: string;
      events?: 'failure' | 'all';
      platform?: 'discord' | 'slack' | 'generic';
    };
    const result = setWebhook({ url, events: events ?? 'failure', platform }, projectFrom(req));
    res.json({ message: result });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// ── Status ─────────────────────────────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  const lastRun = readLastRun(lastRunFor(projectFrom(req)));
  res.json({ lastRun });
});

// ── Run log ───────────────────────────────────────────────────────────────────
// Raw stdout/stderr of the last `npx playwright test` invocation for this
// project — the step-by-step list-reporter output plus full error/call-log
// detail that the summarized last-run.json intentionally drops.
app.get('/api/logs', (req, res) => {
  const logPath = lastRunLogFor(projectFrom(req));
  const log = existsSync(logPath) ? readFileSync(logPath, 'utf-8') : '';
  res.json({ log });
});

// ── Screenshot preview ─────────────────────────────────────────────────────────
// Playwright captures a screenshot on failure (see playwright.config.ts) and
// records its absolute path in results-store's TestFailure.screenshot_path.
// Stream it back so the dashboard can show what the browser looked like —
// guarded to paths actually under this install, never an arbitrary file.
app.get('/api/screenshot', (req, res) => {
  const raw = req.query.path as string | undefined;
  if (!raw) return res.status(400).send('Missing path.');

  const resolved = resolve(raw);
  const allowedRoots = [resolve(ROOT), resolve(PROJECTS_DIR)];
  if (!allowedRoots.some((root) => resolved === root || resolved.startsWith(root + '/'))) {
    return res.status(403).send('Path not allowed.');
  }
  if (!existsSync(resolved)) return res.status(404).send('Screenshot not found.');

  res.sendFile(resolved);
});

// ── Tests ─────────────────────────────────────────────────────────────────────
app.get('/api/tests', (req, res) => {
  const project = projectFrom(req);
  const testsDir = testsDirFor(project);
  const meta = getAllMeta(configDirFor(project));
  const files = existsSync(testsDir)
    ? readdirSync(testsDir).filter((f) => f.endsWith('.spec.ts'))
    : [];

  const lastRun = readLastRun(lastRunFor(project));
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
      running: scheduler.running.some((r) => r.project === project && r.file === filename),
    };
  });

  res.json({ tests });
});

// ── Scheduler / monitor ──────────────────────────────────────────────────────
app.get('/api/scheduler', (_req, res) => {
  res.json(getSchedulerState());
});

app.get('/api/tests/:name', (req, res) => {
  const project = projectFrom(req);
  const safeName = basename(req.params.name).replace(/\.spec\.ts$/, '');
  const filename = `${safeName}.spec.ts`;
  const filePath = join(testsDirFor(project), filename);

  if (!existsSync(filePath)) return res.status(404).json({ error: 'Test not found.' });

  const code = readFileSync(filePath, 'utf-8');
  const meta = getTestMeta(filename, configDirFor(project)) ?? { enabled: true };
  const lastRun = readLastRun(lastRunFor(project));
  const failure = lastRun?.failures.find((f) => basename(f.file) === filename) ?? null;

  res.json({ filename, code, meta, failure });
});

app.post('/api/tests', async (req, res) => {
  try {
    const result = await createTest(req.body, projectFrom(req));
    res.json({ message: result });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

app.put('/api/tests/:name', async (req, res) => {
  try {
    const result = await updateTest({ name: req.params.name, ...req.body }, projectFrom(req));
    res.json({ message: result });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

app.delete('/api/tests/:name', async (req, res) => {
  try {
    const result = await deleteTest({ name: req.params.name, confirm: true }, projectFrom(req));
    res.json({ message: result });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

app.post('/api/tests/:name/run', async (req, res) => {
  const project = projectFrom(req);
  try {
    const message = await runTests({ test_file: req.params.name, wait_for_result: true }, project);
    res.json({ message, lastRun: readLastRun(lastRunFor(project)) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post('/api/run-all', async (req, res) => {
  const project = projectFrom(req);
  try {
    const message = await runTests({ wait_for_result: true }, project);
    res.json({ message, lastRun: readLastRun(lastRunFor(project)) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── Credentials ────────────────────────────────────────────────────────────────
app.get('/api/credentials', (req, res) => {
  const all = readCredentials(configDirFor(projectFrom(req)));
  const credentials = Object.entries(all).map(([name, fields]) => ({
    name,
    fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, maskValue(v)])),
  }));
  res.json({ credentials });
});

app.post('/api/credentials', async (req, res) => {
  try {
    const { name, fields } = req.body as { name: string; fields: Record<string, string> };
    const result = await createCredential({ name, fields }, projectFrom(req));
    // Saved for real (browser → server, never through the AI) — if this was
    // requested via request_credential, that pending request is fulfilled now.
    resolveCredentialRequest(name, configDirFor(projectFrom(req)));
    res.json({ message: result });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// ── Pending credential requests ─────────────────────────────────────────────────
// Populated by the request_credential MCP tool — never carries a value, only
// which fields are needed, so the dashboard can prompt a human to fill them
// in directly (this endpoint), keeping secrets out of the AI's context.
app.get('/api/credential-requests', (req, res) => {
  const requests = readCredentialRequests(configDirFor(projectFrom(req)));
  res.json({ requests });
});

// Explicit dismissal (no credential saved) — for a request that's stale or
// no longer needed, as opposed to resolveCredentialRequest's "fulfilled by
// actually saving one", which happens automatically in POST /api/credentials.
app.delete('/api/credential-requests/:name', (req, res) => {
  resolveCredentialRequest(req.params.name, configDirFor(projectFrom(req)));
  res.json({ message: `Pedido de credencial "${req.params.name}" dispensado.` });
});

app.delete('/api/credentials/:name', async (req, res) => {
  try {
    const result = await deleteCredential({ name: req.params.name }, projectFrom(req));
    res.json({ message: result });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// ── Protection ────────────────────────────────────────────────────────────────
app.get('/api/protection', (req, res) => {
  const config = readProtection(configDirFor(projectFrom(req)));
  // mask values for display
  const masked = Object.fromEntries(
    Object.entries(config.extraHeaders).map(([k, v]) => [k, maskValue(v)]),
  );
  res.json({ extraHeaders: masked });
});

app.put('/api/protection', (req, res) => {
  try {
    const { extraHeaders } = req.body as { extraHeaders: Record<string, string> };
    writeProtection({ extraHeaders: extraHeaders ?? {} }, configDirFor(projectFrom(req)));
    res.json({ message: 'Protection config saved.' });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// ── Status page config ────────────────────────────────────────────────────────
app.get('/api/status-page', (req, res) => {
  res.json(readStatusPage(configDirFor(projectFrom(req))));
});

app.put('/api/status-page', (req, res) => {
  try {
    writeStatusPage(req.body, configDirFor(projectFrom(req)));
    res.json({ message: 'Status page config saved.' });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// ── History ───────────────────────────────────────────────────────────────────
app.get('/api/history', (req, res) => {
  const history = readHistory(configDirFor(projectFrom(req)));
  const uptime = computeUptime(history);
  res.json({ history: history.slice(0, 60), uptime });
});

// ── Public status page ────────────────────────────────────────────────────────
// Status page slugs are looked up across every project, so a public URL
// doesn't need to know which project it belongs to.
app.get('/status/:slug', (req, res) => {
  const slugs: (string | null)[] = [...listProjectSlugs(), ...(hasDefaultProjectData() ? [null] : [])];
  let project: string | null | undefined;
  let cfg: ReturnType<typeof readStatusPage> | undefined;

  for (const slug of slugs) {
    const candidate = readStatusPage(configDirFor(slug));
    if (candidate.enabled && candidate.slug === req.params.slug) {
      project = slug;
      cfg = candidate;
      break;
    }
  }

  if (!cfg || project === undefined) return res.status(404).send('Status page not found.');

  const lastRun = readLastRun(lastRunFor(project));
  const history = readHistory(configDirFor(project));
  const uptime = computeUptime(history);
  const meta = getAllMeta(configDirFor(project));
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
  console.log('Scheduler active — checks every minute, across every project, for tests due to run.\n');
});

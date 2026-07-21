import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { readProtection, buildExtraHeaders } from './protection-store.js';
import { CONFIG_DIR } from './paths.js';

// A pair-debugging session: a visible browser the *human* drives by hand,
// while we record everything around them — console, network, page errors,
// navigations, and (via an injected recorder) their own clicks/fills. The AI
// reads that timeline mid-session (get_pair_debug_context) to correlate what
// the user just did with what broke, and gets a draft Playwright test out of
// it when the session ends (stop_pair_debug).
//
// One session at a time, held in memory for the lifetime of this MCP server
// process — there's exactly one human driving exactly one browser.

type EventKind = 'console' | 'pageerror' | 'response' | 'requestfailed' | 'navigation' | 'action';

interface RecordedEvent {
  ts_ms: number; // ms since session start
  at: string; // ISO wall-clock
  kind: EventKind;
  detail: Record<string, unknown>;
}

interface RecordedAction {
  kind: 'click' | 'fill' | 'check' | 'select';
  selector: string;
  value?: string;
  text?: string;
}

interface Session {
  browser: Browser;
  context: BrowserContext;
  startedAt: number;
  startUrl: string;
  events: RecordedEvent[];
  actions: RecordedAction[];
}

let session: Session | null = null;

export function isSessionActive(): boolean {
  return session !== null;
}

// Injected once per page (init script runs on every new document, including
// pages opened after the session starts) — walks up from the click target to
// something clickable, and derives a best-effort selector Playwright already
// understands natively (id, data-testid, name, or a text= engine string).
const RECORDER_INIT_SCRIPT = `(() => {
  if (window.__tuxedoRecorderInstalled) return;
  window.__tuxedoRecorderInstalled = true;

  function selectorFor(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    for (const attr of ['data-testid', 'data-test-id', 'data-test']) {
      const v = el.getAttribute(attr);
      if (v) return '[' + attr + '="' + v + '"]';
    }
    if (el.name) return el.tagName.toLowerCase() + '[name="' + el.name + '"]';
    const text = (el.innerText || el.textContent || '').trim().slice(0, 40);
    if (text && ['BUTTON', 'A', 'LABEL'].includes(el.tagName)) return 'text=' + text;
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 5) {
      let part = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(' > ');
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('button, a, [role="button"], input[type="submit"], input[type="button"], label, li, td, [onclick]') || e.target;
    window.__tuxedoRecordAction({ kind: 'click', selector: selectorFor(el), text: (el.innerText || '').trim().slice(0, 60) });
  }, true);

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!el || !('tagName' in el)) return;
    if (el.tagName === 'SELECT') {
      window.__tuxedoRecordAction({ kind: 'select', selector: selectorFor(el), value: el.value });
    } else if (el.type === 'checkbox' || el.type === 'radio') {
      window.__tuxedoRecordAction({ kind: 'check', selector: selectorFor(el), value: String(el.checked) });
    } else if ('value' in el) {
      window.__tuxedoRecordAction({ kind: 'fill', selector: selectorFor(el), value: el.value });
    }
  }, true);
})();`;

function push(kind: EventKind, detail: Record<string, unknown>): void {
  if (!session) return;
  session.events.push({ ts_ms: Date.now() - session.startedAt, at: new Date().toISOString(), kind, detail });
}

function attachPageListeners(page: Page): void {
  page.on('console', (msg) => push('console', { type: msg.type(), text: msg.text() }));
  page.on('pageerror', (err) => push('pageerror', { message: err.message }));
  page.on('requestfailed', (req) => {
    push('requestfailed', { method: req.method(), url: req.url(), failure: req.failure()?.errorText ?? 'unknown' });
  });
  page.on('response', (res) => {
    if (res.status() >= 400) {
      push('response', { status: res.status(), url: res.url(), method: res.request().method() });
    }
  });
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) push('navigation', { url: frame.url() });
  });
}

export async function startSession(url: string): Promise<void> {
  if (session) throw new Error('A pair-debugging session is already active. Call stop_pair_debug first.');

  const browser = await chromium.launch({ headless: false });
  const extraHTTPHeaders = buildExtraHeaders(readProtection(CONFIG_DIR));
  const context = await browser.newContext({ extraHTTPHeaders });

  session = { browser, context, startedAt: Date.now(), startUrl: url, events: [], actions: [] };

  await context.exposeFunction('__tuxedoRecordAction', (action: RecordedAction) => {
    session?.actions.push(action);
    push('action', action as unknown as Record<string, unknown>);
  });
  await context.addInitScript(RECORDER_INIT_SCRIPT);
  // Registered before newPage() on purpose — this 'page' event also fires
  // for the page created below, so that call must NOT attach listeners a
  // second time (it used to, and every event was recorded twice).
  context.on('page', attachPageListeners);

  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  } catch (err) {
    // Still leave the session open — a bad URL is exactly the kind of thing
    // the human driving the browser will notice and fix by navigating
    // manually; the error itself is useful context too.
    push('navigation', { url, error: err instanceof Error ? err.message : String(err) });
  }
}

function formatTs(ts_ms: number): string {
  const totalSeconds = ts_ms / 1000;
  const m = Math.floor(totalSeconds / 60);
  const s = (totalSeconds % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

function describeEvent(e: RecordedEvent): string | null {
  switch (e.kind) {
    case 'navigation':
      return e.detail.error
        ? `navegação → ${e.detail.url} (FALHOU: ${e.detail.error})`
        : `navegação → ${e.detail.url}`;
    case 'action': {
      const a = e.detail as unknown as RecordedAction;
      if (a.kind === 'click') return `ação: click em "${a.text || a.selector}" (${a.selector})`;
      if (a.kind === 'fill') return `ação: preencheu "${a.value}" em ${a.selector}`;
      if (a.kind === 'select') return `ação: selecionou "${a.value}" em ${a.selector}`;
      return `ação: marcou ${a.selector} = ${a.value}`;
    }
    case 'console':
      if (e.detail.type !== 'error' && e.detail.type !== 'warning') return null;
      return `console [${e.detail.type}]: ${e.detail.text}`;
    case 'pageerror':
      return `ERRO DE PÁGINA (exceção não tratada): ${e.detail.message}`;
    case 'requestfailed':
      return `rede: ${e.detail.method} ${e.detail.url} → falhou (${e.detail.failure})`;
    case 'response':
      return `rede: ${e.detail.method} ${e.detail.url} → ${e.detail.status}`;
    default:
      return null;
  }
}

function buildTimeline(): string {
  if (!session) throw new Error('No pair-debugging session is active. Call start_pair_debug first.');

  const lines = session.events
    .map((e) => {
      const desc = describeEvent(e);
      return desc ? `[${formatTs(e.ts_ms)}] ${desc}` : null;
    })
    .filter((l): l is string => l !== null);

  const consoleErrors = session.events.filter((e) => e.kind === 'console' && e.detail.type === 'error').length;
  const pageErrors = session.events.filter((e) => e.kind === 'pageerror').length;
  const failedRequests = session.events.filter((e) => e.kind === 'requestfailed' || e.kind === 'response').length;
  const elapsed = formatTs(Date.now() - session.startedAt);

  const header = [
    `Sessão de pair-debugging ativa — iniciada há ${elapsed} em ${session.startUrl}.`,
    `${session.actions.length} ação(ões) registrada(s), ${consoleErrors} erro(s) de console, ${pageErrors} exceção(ões) de página, ${failedRequests} request(s) com falha/erro HTTP.`,
    '',
  ];

  if (lines.length === 0) {
    return [...header, '(nada registrado ainda — siga o fluxo no navegador)'].join('\n');
  }

  return [...header, 'Linha do tempo:', ...lines].join('\n');
}

export function getSessionSummary(): string {
  return buildTimeline();
}

function generateDraftTest(): string {
  if (!session) throw new Error('No pair-debugging session is active.');

  const lines = [
    `import { test, expect } from '@playwright/test';`,
    '',
    `// Rascunho gerado a partir de uma sessão de pair-debugging (${new Date().toISOString()}).`,
    `// Seletores são heurísticos (id > data-testid > name > texto > nth-of-type) — revise antes`,
    `// de salvar como teste real, e adicione expects nos pontos que importam.`,
    `test('sessão de pair-debugging gravada', async ({ page }) => {`,
    `  await page.goto(${JSON.stringify(session.startUrl)});`,
  ];

  for (const a of session.actions) {
    if (a.kind === 'click') lines.push(`  await page.click(${JSON.stringify(a.selector)});`);
    else if (a.kind === 'fill') lines.push(`  await page.fill(${JSON.stringify(a.selector)}, ${JSON.stringify(a.value ?? '')});`);
    else if (a.kind === 'select') lines.push(`  await page.selectOption(${JSON.stringify(a.selector)}, ${JSON.stringify(a.value ?? '')});`);
    else if (a.kind === 'check') lines.push(`  await page.setChecked(${JSON.stringify(a.selector)}, ${a.value === 'true'});`);
  }

  lines.push(`});`, '');
  return lines.join('\n');
}

export async function stopSession(): Promise<string> {
  if (!session) throw new Error('No pair-debugging session is active.');

  const timeline = buildTimeline();
  const draft = generateDraftTest();

  await session.context.close();
  await session.browser.close();
  session = null;

  return [
    timeline,
    '',
    '── Rascunho de teste Playwright gerado a partir da sessão ──',
    '```typescript',
    draft,
    '```',
    'Se quiser guardar isso como teste de verdade, chame create_test com este código (ajustando seletores/expects antes).',
  ].join('\n');
}

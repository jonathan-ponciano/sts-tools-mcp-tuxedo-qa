import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Where the installation itself lives (node_modules, playwright.config.ts,
// dist/) — always fixed, used as the cwd when spawning `npx playwright`.
export const ROOT = join(__dirname, '..', '..');

// Lets one tuxedo-qa installation serve several isolated projects: set
// TUXEDO_QA_PROJECT to a slug per MCP registration (and per `npm run
// dashboard` if you want a separate dashboard/scheduler too) and that
// project's tests/config/results live under their own projects/<slug>/
// subtree. Kept inside ROOT — rather than an arbitrary external path —
// so test files can still resolve @playwright/test via this install's
// node_modules (Node can't see node_modules outside this tree).
const project = process.env.TUXEDO_QA_PROJECT?.replace(/[^a-zA-Z0-9_-]/g, '') || null;
export const NAMESPACE = project ? join(ROOT, 'projects', project) : ROOT;

export const TESTS_DIR = join(NAMESPACE, 'tests');
export const RESULTS_DIR = join(NAMESPACE, 'results');
export const CONFIG_DIR = join(NAMESPACE, 'config');
export const WEBHOOK_CONFIG    = join(CONFIG_DIR, 'webhook.json');
export const PAUSE_CONFIG      = join(CONFIG_DIR, 'pause.json');
export const PROTECTION_CONFIG = join(CONFIG_DIR, 'protection.json');
export const STATUS_PAGE_CONFIG= join(CONFIG_DIR, 'status-page.json');
export const RUN_HISTORY       = join(CONFIG_DIR, 'run-history.json');
export const LAST_RUN          = join(RESULTS_DIR, 'last-run.json');

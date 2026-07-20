import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const ROOT = join(__dirname, '..', '..');
export const TESTS_DIR = join(ROOT, 'tests');
export const RESULTS_DIR = join(ROOT, 'results');
export const CONFIG_DIR = join(ROOT, 'config');
export const WEBHOOK_CONFIG    = join(CONFIG_DIR, 'webhook.json');
export const PAUSE_CONFIG      = join(CONFIG_DIR, 'pause.json');
export const PROTECTION_CONFIG = join(CONFIG_DIR, 'protection.json');
export const STATUS_PAGE_CONFIG= join(CONFIG_DIR, 'status-page.json');
export const RUN_HISTORY       = join(CONFIG_DIR, 'run-history.json');
export const LAST_RUN          = join(RESULTS_DIR, 'last-run.json');

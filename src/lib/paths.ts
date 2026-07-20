import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Where the installation itself lives (node_modules, playwright.config.ts,
// dist/) — always fixed, used as the cwd when spawning `npx playwright`.
export const ROOT = join(__dirname, '..', '..');
export const PROJECTS_DIR = join(ROOT, 'projects');

// Lets one tuxedo-qa installation serve several isolated projects: set
// TUXEDO_QA_PROJECT to a slug per MCP registration and that project's
// tests/config/results live under their own projects/<slug>/ subtree.
// Kept inside ROOT — rather than an arbitrary external path — so test
// files can still resolve @playwright/test via this install's node_modules
// (Node can't see node_modules outside this tree).
//
// This process's own project (used directly by every MCP tool call, which
// always acts on "whichever project this server was registered for").
export const CURRENT_PROJECT = process.env.TUXEDO_QA_PROJECT?.replace(/[^a-zA-Z0-9_-]/g, '') || null;

export function namespaceFor(slug: string | null): string {
  return slug ? join(PROJECTS_DIR, slug) : ROOT;
}
export function testsDirFor(slug: string | null): string { return join(namespaceFor(slug), 'tests'); }
export function resultsDirFor(slug: string | null): string { return join(namespaceFor(slug), 'results'); }
export function configDirFor(slug: string | null): string { return join(namespaceFor(slug), 'config'); }
export function lastRunFor(slug: string | null): string { return join(resultsDirFor(slug), 'last-run.json'); }

// For the dashboard, which (unlike the MCP tools) needs to see every
// project at once rather than just the one its own env points to.
export function listProjectSlugs(): string[] {
  const namespaced = existsSync(PROJECTS_DIR)
    ? readdirSync(PROJECTS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];
  return namespaced.sort();
}

// True if the unnamespaced (no TUXEDO_QA_PROJECT) install root has any of
// its own data — lets the dashboard decide whether to show a "default"
// project alongside the namespaced ones.
export function hasDefaultProjectData(): boolean {
  return existsSync(join(ROOT, 'tests')) || existsSync(join(ROOT, 'config'));
}

export const NAMESPACE       = namespaceFor(CURRENT_PROJECT);
export const TESTS_DIR       = join(NAMESPACE, 'tests');
export const RESULTS_DIR     = join(NAMESPACE, 'results');
export const CONFIG_DIR      = join(NAMESPACE, 'config');
export const WEBHOOK_CONFIG    = join(CONFIG_DIR, 'webhook.json');
export const PAUSE_CONFIG      = join(CONFIG_DIR, 'pause.json');
export const PROTECTION_CONFIG = join(CONFIG_DIR, 'protection.json');
export const STATUS_PAGE_CONFIG= join(CONFIG_DIR, 'status-page.json');
export const RUN_HISTORY       = join(CONFIG_DIR, 'run-history.json');
export const LAST_RUN          = join(RESULTS_DIR, 'last-run.json');

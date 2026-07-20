import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { CONFIG_DIR, RUN_HISTORY } from './paths.js';
import type { RunSummary } from './results-store.js';

const MAX_ENTRIES = 60;

export interface HistoryEntry extends RunSummary {
  id: string;
}

export function readHistory(): HistoryEntry[] {
  if (!existsSync(RUN_HISTORY)) return [];
  return JSON.parse(readFileSync(RUN_HISTORY, 'utf-8')) as HistoryEntry[];
}

export function appendHistory(summary: RunSummary): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const history = readHistory();
  const entry: HistoryEntry = { ...summary, id: `${Date.now()}` };
  history.unshift(entry);
  writeFileSync(RUN_HISTORY, JSON.stringify(history.slice(0, MAX_ENTRIES), null, 2), 'utf-8');
}

export function computeUptime(history: HistoryEntry[], days = 30): number {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const window = history.filter((e) => new Date(e.run_at).getTime() >= cutoff);
  if (!window.length) return 100;
  const passed = window.filter((e) => e.failed === 0).length;
  return Math.round((passed / window.length) * 1000) / 10;
}

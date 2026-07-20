import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { CONFIG_DIR } from './paths.js';
import type { RunSummary } from './results-store.js';

const MAX_ENTRIES = 60;

export interface HistoryEntry extends RunSummary {
  id: string;
}

function historyFile(configDir: string): string {
  return join(configDir, 'run-history.json');
}

export function readHistory(configDir: string = CONFIG_DIR): HistoryEntry[] {
  const file = historyFile(configDir);
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, 'utf-8')) as HistoryEntry[];
}

export function appendHistory(summary: RunSummary, configDir: string = CONFIG_DIR): void {
  mkdirSync(configDir, { recursive: true });
  const history = readHistory(configDir);
  const entry: HistoryEntry = { ...summary, id: `${Date.now()}` };
  history.unshift(entry);
  writeFileSync(historyFile(configDir), JSON.stringify(history.slice(0, MAX_ENTRIES), null, 2), 'utf-8');
}

export function computeUptime(history: HistoryEntry[], days = 30): number {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const window = history.filter((e) => new Date(e.run_at).getTime() >= cutoff);
  if (!window.length) return 100;
  const passed = window.filter((e) => e.failed === 0).length;
  return Math.round((passed / window.length) * 1000) / 10;
}

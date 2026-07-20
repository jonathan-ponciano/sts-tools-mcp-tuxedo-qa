import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { CONFIG_DIR } from './paths.js';
import { join } from 'path';

export interface TestMeta {
  name?: string;
  description?: string;
  schedule?: '1h' | '6h' | '24h';
  tags?: string[];
  credential?: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  last_run_at?: string;
}

type MetaStore = Record<string, TestMeta>;

function metaFile(configDir: string): string {
  return join(configDir, 'test-metadata.json');
}

function load(configDir: string): MetaStore {
  const file = metaFile(configDir);
  if (!existsSync(file)) return {};
  return JSON.parse(readFileSync(file, 'utf-8')) as MetaStore;
}

function save(store: MetaStore, configDir: string): void {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(metaFile(configDir), JSON.stringify(store, null, 2), 'utf-8');
}

export function getTestMeta(filename: string, configDir: string = CONFIG_DIR): TestMeta | null {
  const store = load(configDir);
  return store[filename] ?? null;
}

export function upsertTestMeta(
  filename: string,
  updates: Partial<TestMeta>,
  configDir: string = CONFIG_DIR,
): TestMeta {
  const store = load(configDir);
  const now = new Date().toISOString();
  const existing = store[filename] ?? { enabled: true, created_at: now, updated_at: now };
  const merged = { ...existing, ...updates, updated_at: now };
  store[filename] = merged;
  save(store, configDir);
  return merged;
}

export function deleteTestMeta(filename: string, configDir: string = CONFIG_DIR): void {
  const store = load(configDir);
  delete store[filename];
  save(store, configDir);
}

export function getAllMeta(configDir: string = CONFIG_DIR): MetaStore {
  return load(configDir);
}

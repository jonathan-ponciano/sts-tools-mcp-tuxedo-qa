import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { CONFIG_DIR } from './paths.js';
import { join } from 'path';

const META_FILE = join(CONFIG_DIR, 'test-metadata.json');

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

function load(): MetaStore {
  if (!existsSync(META_FILE)) return {};
  return JSON.parse(readFileSync(META_FILE, 'utf-8')) as MetaStore;
}

function save(store: MetaStore): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(META_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

export function getTestMeta(filename: string): TestMeta | null {
  const store = load();
  return store[filename] ?? null;
}

export function upsertTestMeta(filename: string, updates: Partial<TestMeta>): TestMeta {
  const store = load();
  const now = new Date().toISOString();
  const existing = store[filename] ?? { enabled: true, created_at: now, updated_at: now };
  const merged = { ...existing, ...updates, updated_at: now };
  store[filename] = merged;
  save(store);
  return merged;
}

export function deleteTestMeta(filename: string): void {
  const store = load();
  delete store[filename];
  save(store);
}

export function getAllMeta(): MetaStore {
  return load();
}

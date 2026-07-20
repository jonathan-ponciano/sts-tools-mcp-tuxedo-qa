import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { CONFIG_DIR, STATUS_PAGE_CONFIG } from './paths.js';

export interface StatusPageConfig {
  enabled: boolean;
  slug: string;
  name: string;
  tests: string[];
}

const DEFAULT: StatusPageConfig = { enabled: false, slug: '', name: '', tests: [] };

export function readStatusPage(): StatusPageConfig {
  if (!existsSync(STATUS_PAGE_CONFIG)) return { ...DEFAULT };
  return JSON.parse(readFileSync(STATUS_PAGE_CONFIG, 'utf-8')) as StatusPageConfig;
}

export function writeStatusPage(config: StatusPageConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(STATUS_PAGE_CONFIG, JSON.stringify(config, null, 2), 'utf-8');
}

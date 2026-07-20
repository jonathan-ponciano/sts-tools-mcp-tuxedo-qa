import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { CONFIG_DIR } from './paths.js';

export interface StatusPageConfig {
  enabled: boolean;
  slug: string;
  name: string;
  tests: string[];
}

const DEFAULT: StatusPageConfig = { enabled: false, slug: '', name: '', tests: [] };

function statusPageFile(configDir: string): string {
  return join(configDir, 'status-page.json');
}

export function readStatusPage(configDir: string = CONFIG_DIR): StatusPageConfig {
  const file = statusPageFile(configDir);
  if (!existsSync(file)) return { ...DEFAULT };
  return JSON.parse(readFileSync(file, 'utf-8')) as StatusPageConfig;
}

export function writeStatusPage(config: StatusPageConfig, configDir: string = CONFIG_DIR): void {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(statusPageFile(configDir), JSON.stringify(config, null, 2), 'utf-8');
}

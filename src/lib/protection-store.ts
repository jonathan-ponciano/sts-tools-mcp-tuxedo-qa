import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { CONFIG_DIR, PROTECTION_CONFIG } from './paths.js';

export interface ProtectionConfig {
  extraHeaders: Record<string, string>;
}

export function readProtection(): ProtectionConfig {
  if (!existsSync(PROTECTION_CONFIG)) return { extraHeaders: {} };
  return JSON.parse(readFileSync(PROTECTION_CONFIG, 'utf-8')) as ProtectionConfig;
}

export function writeProtection(config: ProtectionConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(PROTECTION_CONFIG, JSON.stringify(config, null, 2), 'utf-8');
}

export function buildExtraHeaders(config: ProtectionConfig): Record<string, string> {
  return config.extraHeaders ?? {};
}

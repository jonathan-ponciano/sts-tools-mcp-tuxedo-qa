import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { CONFIG_DIR } from './paths.js';

export interface ProtectionConfig {
  extraHeaders: Record<string, string>;
}

function protectionFile(configDir: string): string {
  return join(configDir, 'protection.json');
}

export function readProtection(configDir: string = CONFIG_DIR): ProtectionConfig {
  const file = protectionFile(configDir);
  if (!existsSync(file)) return { extraHeaders: {} };
  return JSON.parse(readFileSync(file, 'utf-8')) as ProtectionConfig;
}

export function writeProtection(config: ProtectionConfig, configDir: string = CONFIG_DIR): void {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(protectionFile(configDir), JSON.stringify(config, null, 2), 'utf-8');
}

export function buildExtraHeaders(config: ProtectionConfig): Record<string, string> {
  return config.extraHeaders ?? {};
}

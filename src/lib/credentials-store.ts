import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { CONFIG_DIR } from './paths.js';
import { join } from 'path';

function credsFile(configDir: string): string {
  return join(configDir, 'credentials.json');
}

export type CredentialSet = Record<string, string>;
export type CredentialsMap = Record<string, CredentialSet>;

export function readCredentials(configDir: string = CONFIG_DIR): CredentialsMap {
  const file = credsFile(configDir);
  if (!existsSync(file)) return {};
  return JSON.parse(readFileSync(file, 'utf-8')) as CredentialsMap;
}

function writeCredentials(data: CredentialsMap, configDir: string): void {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(credsFile(configDir), JSON.stringify(data, null, 2), 'utf-8');
}

export function upsertCredential(name: string, fields: CredentialSet, configDir: string = CONFIG_DIR): void {
  const all = readCredentials(configDir);
  all[name] = { ...all[name], ...fields };
  writeCredentials(all, configDir);
}

export function removeCredential(name: string, configDir: string = CONFIG_DIR): void {
  const all = readCredentials(configDir);
  if (!all[name]) throw new Error(`Credential "${name}" not found.`);
  delete all[name];
  writeCredentials(all, configDir);
}

export function maskValue(value: string): string {
  if (value.length <= 3) return '***';
  return value.slice(0, 3) + '*'.repeat(Math.min(value.length - 3, 5));
}

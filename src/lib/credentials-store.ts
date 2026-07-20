import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { CONFIG_DIR } from './paths.js';
import { join } from 'path';

const CREDS_FILE = join(CONFIG_DIR, 'credentials.json');

export type CredentialSet = Record<string, string>;
export type CredentialsMap = Record<string, CredentialSet>;

export function readCredentials(): CredentialsMap {
  if (!existsSync(CREDS_FILE)) return {};
  return JSON.parse(readFileSync(CREDS_FILE, 'utf-8')) as CredentialsMap;
}

function writeCredentials(data: CredentialsMap): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CREDS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export function upsertCredential(name: string, fields: CredentialSet): void {
  const all = readCredentials();
  all[name] = { ...all[name], ...fields };
  writeCredentials(all);
}

export function removeCredential(name: string): void {
  const all = readCredentials();
  if (!all[name]) throw new Error(`Credential "${name}" not found.`);
  delete all[name];
  writeCredentials(all);
}

export function maskValue(value: string): string {
  if (value.length <= 3) return '***';
  return value.slice(0, 3) + '*'.repeat(Math.min(value.length - 3, 5));
}

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { CONFIG_DIR } from './paths.js';

// A "please fill this in yourself" request — the AI declares which fields it
// needs (names only, never values) and a human fills the actual secret
// straight into the dashboard's existing credential form, which posts
// directly to the server. The value never passes through a tool call, so it
// never enters the model's context.
export interface CredentialRequest {
  name: string;
  fields: string[];
  reason?: string;
  requested_at: string;
}

function requestsFile(configDir: string): string {
  return join(configDir, 'credential-requests.json');
}

export function readCredentialRequests(configDir: string = CONFIG_DIR): CredentialRequest[] {
  const file = requestsFile(configDir);
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, 'utf-8')) as CredentialRequest[];
}

function writeCredentialRequests(requests: CredentialRequest[], configDir: string): void {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(requestsFile(configDir), JSON.stringify(requests, null, 2), 'utf-8');
}

export function addCredentialRequest(request: Omit<CredentialRequest, 'requested_at'>, configDir: string = CONFIG_DIR): void {
  const requests = readCredentialRequests(configDir).filter((r) => r.name !== request.name);
  requests.push({ ...request, requested_at: new Date().toISOString() });
  writeCredentialRequests(requests, configDir);
}

// Called once the human actually saves the credential via the dashboard —
// clears the pending request for that name, since it's fulfilled.
export function resolveCredentialRequest(name: string, configDir: string = CONFIG_DIR): void {
  const requests = readCredentialRequests(configDir).filter((r) => r.name !== name);
  writeCredentialRequests(requests, configDir);
}

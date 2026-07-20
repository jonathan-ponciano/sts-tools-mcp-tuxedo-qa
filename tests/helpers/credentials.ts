import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CREDS_FILE = join(__dirname, '..', '..', 'config', 'credentials.json');

type CredentialSet = Record<string, string>;

// Acesso direto por label — útil quando o teste precisa de múltiplos sets.
export function getCredential(name: string): CredentialSet {
  if (!existsSync(CREDS_FILE)) {
    throw new Error(`credentials.json not found. Use create_credential to add credentials.`);
  }
  const all = JSON.parse(readFileSync(CREDS_FILE, 'utf-8')) as Record<string, CredentialSet>;
  if (!all[name]) {
    const available = Object.keys(all).join(', ') || 'none';
    throw new Error(`Credential "${name}" not found. Available: ${available}`);
  }
  return all[name];
}

// Objeto injetado pelo runner via TUXEDO_CREDENTIALS env var.
// Uso: credentials.EMAIL, credentials.PASSWORD, etc.
// O label é configurado por teste em create_test/update_test (campo "credential").
export const credentials: CredentialSet = (() => {
  const raw = process.env.TUXEDO_CREDENTIALS;
  if (!raw) return {};
  try {
    return JSON.parse(raw) as CredentialSet;
  } catch {
    return {};
  }
})();

// Flag que indica se o teste está rodando via tuxedo-qa (útil para pular steps ou logar).
export const isTestRun = process.env.TUXEDO_IS_TEST_RUN === 'true';

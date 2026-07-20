import { z } from 'zod';
import { readCredentials, maskValue } from '../lib/credentials-store.js';

export const listCredentialsSchema = z.object({});

export function listCredentials(): string {
  const all = readCredentials();
  const names = Object.keys(all);

  if (names.length === 0) {
    return 'No credentials configured. Use create_credential to add one.';
  }

  return names
    .map((name) => {
      const fields = Object.entries(all[name])
        .map(([k, v]) => `    ${k}: ${maskValue(v)}`)
        .join('\n');
      return `[${name}]\n${fields}`;
    })
    .join('\n\n');
}

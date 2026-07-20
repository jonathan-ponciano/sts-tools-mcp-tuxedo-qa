import { z } from 'zod';
import { upsertCredential } from '../lib/credentials-store.js';

export const createCredentialSchema = z.object({
  name: z
    .string()
    .describe('Credential set name (e.g. "admin", "user_comum", "superadmin")'),
  fields: z
    .record(z.string())
    .describe('Key-value pairs (e.g. { email, password, token })'),
});

export type CreateCredentialInput = z.infer<typeof createCredentialSchema>;

export function createCredential(input: CreateCredentialInput): string {
  upsertCredential(input.name, input.fields);
  const keys = Object.keys(input.fields).join(', ');
  return `Credential "${input.name}" saved with fields: ${keys}`;
}

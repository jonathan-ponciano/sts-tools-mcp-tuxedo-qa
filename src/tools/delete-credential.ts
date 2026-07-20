import { z } from 'zod';
import { removeCredential } from '../lib/credentials-store.js';
import { configDirFor, CURRENT_PROJECT } from '../lib/paths.js';

export const deleteCredentialSchema = z.object({
  name: z.string().describe('Credential set name to delete'),
});

export type DeleteCredentialInput = z.infer<typeof deleteCredentialSchema>;

export function deleteCredential(input: DeleteCredentialInput, project?: string | null): string {
  const p = project !== undefined ? project : CURRENT_PROJECT;
  removeCredential(input.name, configDirFor(p));
  return `Credential "${input.name}" deleted.`;
}

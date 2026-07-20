import { z } from 'zod';
import { removeCredential } from '../lib/credentials-store.js';

export const deleteCredentialSchema = z.object({
  name: z.string().describe('Credential set name to delete'),
});

export type DeleteCredentialInput = z.infer<typeof deleteCredentialSchema>;

export function deleteCredential(input: DeleteCredentialInput): string {
  removeCredential(input.name);
  return `Credential "${input.name}" deleted.`;
}

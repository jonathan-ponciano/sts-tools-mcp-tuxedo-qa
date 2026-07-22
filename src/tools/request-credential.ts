import { z } from 'zod';
import { addCredentialRequest } from '../lib/credential-requests-store.js';
import { readCredentials } from '../lib/credentials-store.js';
import { configDirFor, CURRENT_PROJECT } from '../lib/paths.js';

export const requestCredentialSchema = z.object({
  name: z.string().describe('Credential set name (e.g. "admin", "user_comum")'),
  fields: z
    .array(z.string())
    .describe('Which field names are needed (e.g. ["email", "password"]) — field NAMES only, never actual values'),
  reason: z
    .string()
    .optional()
    .describe('Why this credential is needed, shown to the human in the dashboard (e.g. "login flow for the checkout test")'),
});

export type RequestCredentialInput = z.infer<typeof requestCredentialSchema>;

// Use this instead of create_credential whenever the human hasn't already
// pasted a real value into the chat themselves — it never asks for or
// carries an actual secret through a tool call. The human fills the real
// value straight into the dashboard's credential form (browser → server
// directly), which this never sees.
export function requestCredential(input: RequestCredentialInput, project?: string | null): string {
  const p = project !== undefined ? project : CURRENT_PROJECT;
  const configDir = configDirFor(p);

  if (readCredentials(configDir)[input.name]) {
    return `Credential "${input.name}" já existe — não precisa pedir de novo. Se quiser trocar o valor, peça pro humano atualizar direto no dashboard (aba Credenciais); não passe o valor novo aqui no chat.`;
  }

  addCredentialRequest({ name: input.name, fields: input.fields, reason: input.reason }, configDir);

  return [
    `Pedido de credencial "${input.name}" registrado (campos: ${input.fields.join(', ')}).`,
    'Peça pro humano abrir o dashboard (aba Credenciais) — o pedido já aparece lá com um botão pra preencher.',
    'Os valores vão direto do formulário pro servidor; eu nunca vejo. Assim que a pessoa salvar, ela confirma aqui e eu sigo.',
  ].join('\n');
}

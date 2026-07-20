// Mecanismo de pausa humana para fluxos 2FA em testes de QA.
//
// Como funciona:
//   1. O teste chama `requestInput(label)` — escreve um arquivo de sinal em SIGNAL_FILE.
//   2. Claude lê o arquivo, percebe que está aguardando, e pede ao usuário o dado.
//   3. O usuário passa o dado para Claude, que escreve `{ status:'ready', value:'...' }`.
//   4. O helper lê o valor, limpa o arquivo e retorna para o teste continuar.
//
// Para fornecer manualmente via terminal:
//   echo '{"status":"ready","value":"123456"}' > /tmp/tuxedo-human.json

import fs from 'fs';

export const SIGNAL_FILE = '/tmp/tuxedo-human.json';

export interface SignalWaiting {
  status: 'waiting';
  label: string;
  ts: number;
}

export interface SignalReady {
  status: 'ready';
  value: string;
}

export type Signal = SignalWaiting | SignalReady | { status: 'done' | 'timeout' };

export function readSignal(): Signal | null {
  try {
    return JSON.parse(fs.readFileSync(SIGNAL_FILE, 'utf8')) as Signal;
  } catch {
    return null;
  }
}

export function writeSignal(signal: Signal): void {
  fs.writeFileSync(SIGNAL_FILE, JSON.stringify(signal, null, 2));
}

/**
 * Pausa o teste e aguarda um valor fornecido pelo humano (ex: código SMS).
 * @param label  Descrição do que está sendo solicitado (exibida no arquivo de sinal).
 * @param timeoutMs  Tempo máximo de espera (padrão: 5 minutos).
 */
export async function requestInput(label: string, timeoutMs = 5 * 60 * 1000): Promise<string> {
  writeSignal({ status: 'waiting', label, ts: Date.now() });

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    const signal = readSignal();
    if (signal?.status === 'ready' && 'value' in signal && signal.value) {
      writeSignal({ status: 'done' });
      return signal.value;
    }
  }

  writeSignal({ status: 'timeout' });
  throw new Error(`[human-loop] Tempo esgotado aguardando: "${label}"`);
}

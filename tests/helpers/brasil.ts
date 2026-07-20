// Geradores e validadores de documentos brasileiros para uso em testes de QA.

function randDigits(n: number): number[] {
  return Array.from({ length: n }, () => Math.floor(Math.random() * 10));
}

function verificationDigit(digits: number[], weights: number[]): number {
  const sum = digits.reduce((acc, d, i) => acc + d * weights[i], 0);
  const rem = sum % 11;
  return rem < 2 ? 0 : 11 - rem;
}

export function generateCPF(formatted = false): string {
  const base = randDigits(9);
  const d1 = verificationDigit(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = verificationDigit([...base, d1], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const digits = [...base, d1, d2].join('');
  return formatted
    ? `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
    : digits;
}

export function validateCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '').split('').map(Number);
  if (digits.length !== 11 || digits.every((d) => d === digits[0])) return false;
  const d1 = verificationDigit(digits.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = verificationDigit(digits.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digits[9] === d1 && digits[10] === d2;
}

export function generateCNPJ(formatted = false): string {
  const base = [...randDigits(8), 0, 0, 0, 1]; // filial padrão 0001
  const d1 = verificationDigit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = verificationDigit([...base, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const digits = [...base, d1, d2].join('');
  return formatted
    ? `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
    : digits;
}

export function validateCNPJ(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, '').split('').map(Number);
  if (digits.length !== 14 || digits.every((d) => d === digits[0])) return false;
  const d1 = verificationDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = verificationDigit(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digits[12] === d1 && digits[13] === d2;
}

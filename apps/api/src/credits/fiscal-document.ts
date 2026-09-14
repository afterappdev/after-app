import { BadRequestException } from '@nestjs/common';

export type FiscalPersonType = 'CPF' | 'CNPJ';

export type FiscalPurchaseInput = {
  invoiceRequested?: boolean;
  fiscalPersonType?: string | null;
  fiscalName?: string | null;
  fiscalDocument?: string | null;
  fiscalEmail?: string | null;
};

export type FiscalSnapshot = {
  invoiceRequested: boolean;
  fiscalPersonType: FiscalPersonType | null;
  fiscalName: string | null;
  fiscalDocument: string | null;
  fiscalEmail: string | null;
};

const EMPTY_FISCAL: FiscalSnapshot = {
  invoiceRequested: false,
  fiscalPersonType: null,
  fiscalName: null,
  fiscalDocument: null,
  fiscalEmail: null,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function digitsOnly(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

export function isValidCpf(value: string): boolean {
  const digits = digitsOnly(value);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    sum += Number(digits[i]) * (10 - i);
  }
  let check = (sum * 10) % 11;
  if (check === 10) check = 0;
  if (check !== Number(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i += 1) {
    sum += Number(digits[i]) * (11 - i);
  }
  check = (sum * 10) % 11;
  if (check === 10) check = 0;
  return check === Number(digits[10]);
}

export function isValidCnpj(value: string): boolean {
  const digits = digitsOnly(value);
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += Number(digits[i]) * w1[i];
  }
  let rem = sum % 11;
  const d1 = rem < 2 ? 0 : 11 - rem;
  if (d1 !== Number(digits[12])) return false;

  sum = 0;
  for (let i = 0; i < 13; i += 1) {
    sum += Number(digits[i]) * w2[i];
  }
  rem = sum % 11;
  const d2 = rem < 2 ? 0 : 11 - rem;
  return d2 === Number(digits[13]);
}

export function normalizeFiscalEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function resolveFiscalSnapshot(
  input: FiscalPurchaseInput | null | undefined,
): FiscalSnapshot {
  if (!input?.invoiceRequested) {
    return { ...EMPTY_FISCAL };
  }

  const personType = (input.fiscalPersonType ?? '').trim().toUpperCase();
  if (personType !== 'CPF' && personType !== 'CNPJ') {
    throw new BadRequestException('Informe se o documento fiscal é CPF ou CNPJ.');
  }

  const fiscalName = (input.fiscalName ?? '').trim();
  if (fiscalName.length < 2) {
    throw new BadRequestException('Informe o nome ou razão social.');
  }

  const fiscalDocument = digitsOnly(input.fiscalDocument);
  if (personType === 'CPF') {
    if (!isValidCpf(fiscalDocument)) {
      throw new BadRequestException('CPF inválido.');
    }
  } else if (!isValidCnpj(fiscalDocument)) {
    throw new BadRequestException('CNPJ inválido.');
  }

  const fiscalEmail = normalizeFiscalEmail(input.fiscalEmail);
  if (!EMAIL_RE.test(fiscalEmail)) {
    throw new BadRequestException('E-mail fiscal inválido.');
  }

  return {
    invoiceRequested: true,
    fiscalPersonType: personType,
    fiscalName,
    fiscalDocument,
    fiscalEmail,
  };
}

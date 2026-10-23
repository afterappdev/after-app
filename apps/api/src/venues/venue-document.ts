import { BadRequestException } from '@nestjs/common';
import { digitsOnly, isValidCnpj, isValidCpf } from '../credits/fiscal-document';

export const VENUE_DOCUMENT_REQUIRED = 'Informe um CPF ou CNPJ.';
export const VENUE_CPF_INVALID = 'CPF inválido.';
export const VENUE_CNPJ_INVALID = 'CNPJ inválido.';
export const VENUE_DOCUMENT_TAKEN =
  'Este CPF ou CNPJ já está vinculado a outro estabelecimento.';

export type VenueDocumentTypeName = 'CPF' | 'CNPJ';

export type VenueDocument = {
  documentType: VenueDocumentTypeName;
  documentDigits: string;
};

/**
 * Mathematical check only. It does not consult the Receita Federal.
 * The stored value is digits, so punctuation cannot create a second identity.
 */
export function resolveVenueDocument(input: {
  documentType?: string | null;
  documentNumber?: string | null;
} | null | undefined): VenueDocument {
  const documentType = (input?.documentType ?? '').trim().toUpperCase();
  const documentDigits = digitsOnly(input?.documentNumber);
  if (documentType !== 'CPF' && documentType !== 'CNPJ') {
    throw new BadRequestException(VENUE_DOCUMENT_REQUIRED);
  }
  if (!documentDigits) {
    throw new BadRequestException(VENUE_DOCUMENT_REQUIRED);
  }
  if (documentType === 'CPF') {
    if (!isValidCpf(documentDigits)) {
      throw new BadRequestException(VENUE_CPF_INVALID);
    }
  } else if (!isValidCnpj(documentDigits)) {
    throw new BadRequestException(VENUE_CNPJ_INVALID);
  }
  return { documentType, documentDigits };
}

export function isVenueDocumentConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if ((error as { code?: string }).code !== 'P2002') return false;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  const text = Array.isArray(target) ? target.join(' ') : String(target ?? '');
  return text.includes('documentDigits') || text.includes('documentType');
}

export function omitVenueDocument<T extends object>(venue: T): T {
  const copy = { ...venue } as T & {
    documentType?: unknown;
    documentDigits?: unknown;
  };
  delete copy.documentType;
  delete copy.documentDigits;
  return copy;
}

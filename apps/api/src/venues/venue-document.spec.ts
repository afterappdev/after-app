import { readFileSync } from 'fs';
import { join } from 'path';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { VenuesService } from './venues.service';
import {
  VENUE_CNPJ_INVALID,
  VENUE_CPF_INVALID,
  VENUE_DOCUMENT_REQUIRED,
  VENUE_DOCUMENT_TAKEN,
  isVenueDocumentConflict,
  omitVenueDocument,
  resolveVenueDocument,
} from './venue-document';

const CPF = '12345678909';
const CNPJ = '11444777000161';

describe('venue document validation', () => {
  it('aceita CPF e CNPJ com e sem máscara', () => {
    expect(resolveVenueDocument({ documentType: 'CPF', documentNumber: '123.456.789-09' })).toEqual({
      documentType: 'CPF',
      documentDigits: CPF,
    });
    expect(resolveVenueDocument({ documentType: 'cpf', documentNumber: CPF })).toEqual({
      documentType: 'CPF',
      documentDigits: CPF,
    });
    expect(
      resolveVenueDocument({ documentType: 'CNPJ', documentNumber: '11.444.777/0001-61' }),
    ).toEqual({ documentType: 'CNPJ', documentDigits: CNPJ });
    expect(resolveVenueDocument({ documentType: 'CNPJ', documentNumber: CNPJ }).documentDigits).toBe(
      CNPJ,
    );
  });

  it('rejeita ausência, dígitos verificadores e sequências repetidas sem repetir o número', () => {
    expect(() => resolveVenueDocument(null)).toThrow(VENUE_DOCUMENT_REQUIRED);
    expect(() => resolveVenueDocument({ documentType: 'CPF', documentNumber: '' })).toThrow(
      VENUE_DOCUMENT_REQUIRED,
    );
    for (const number of ['111.111.111-11', '12345678900', '123']) {
      try {
        resolveVenueDocument({ documentType: 'CPF', documentNumber: number });
        fail('cpf deveria falhar');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).message).toBe(VENUE_CPF_INVALID);
        expect((error as BadRequestException).message).not.toContain(number.replace(/\D/g, ''));
      }
    }
    for (const number of ['00.000.000/0000-00', '11444777000162']) {
      try {
        resolveVenueDocument({ documentType: 'CNPJ', documentNumber: number });
        fail('cnpj deveria falhar');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).message).toBe(VENUE_CNPJ_INVALID);
        expect(String(error)).not.toContain(number.replace(/\D/g, ''));
      }
    }
  });

  it('trata CPF e CNPJ como identidades distintas e reconhece o conflito único', () => {
    expect(resolveVenueDocument({ documentType: 'CPF', documentNumber: CPF }).documentType).not.toBe(
      resolveVenueDocument({ documentType: 'CNPJ', documentNumber: CNPJ }).documentType,
    );
    expect(
      isVenueDocumentConflict({
        code: 'P2002',
        meta: { target: ['documentType', 'documentDigits'] },
      }),
    ).toBe(true);
    expect(isVenueDocumentConflict({ code: 'P2002', meta: { target: ['email'] } })).toBe(false);
  });

  it('omite o documento do payload público', () => {
    const visible = omitVenueDocument({
      id: 'v1',
      name: 'Bar',
      documentType: 'CPF',
      documentDigits: CPF,
    });
    expect(visible).toEqual({ id: 'v1', name: 'Bar' });
    expect(JSON.stringify(visible)).not.toContain(CPF);
  });

  it('a migration nova é aditiva e não inventa documento para contas antigas', () => {
    const sql = readFileSync(
      join(
        __dirname,
        '../../prisma/migrations/20261021170000_venue_document/migration.sql',
      ),
      'utf8',
    );
    expect(sql).toContain('ADD COLUMN "documentType"');
    expect(sql).toContain('ADD COLUMN "documentDigits"');
    expect(sql).toContain('Venue_documentType_documentDigits_key');
    expect(sql).not.toContain('NOT NULL');
    expect(sql).not.toContain('UPDATE "Venue"');
  });
});

describe('venue fiscal document access', () => {
  function service() {
    const prisma = {
      venue: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      creditPurchase: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    const venues = new VenuesService(prisma as never, {
      deleteStoredUploads: jest.fn(),
    } as never);
    return { prisma, venues };
  }

  it('conta antiga segue sem documento e só o dono lê', async () => {
    const { prisma, venues } = service();
    prisma.venue.findUnique.mockResolvedValue({
      id: 'v1',
      ownerUserId: 'owner',
      documentType: null,
      documentDigits: null,
    });
    await expect(venues.readFiscalDocument('other', 'v1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const legacy = await venues.readFiscalDocument('owner', 'v1');
    expect(legacy.documentType).toBeNull();
    expect(legacy.documentDigits).toBeNull();
    expect(legacy.sufficientForInvoice).toBe(false);
  });

  it('grava só os dígitos e devolve a leitura autorizada', async () => {
    const { prisma, venues } = service();
    prisma.venue.findUnique.mockResolvedValue({
      id: 'v1',
      ownerUserId: 'owner',
      documentType: null,
      documentDigits: null,
    });
    prisma.venue.update.mockImplementation(async (args: { data: { documentType: string; documentDigits: string } }) => {
      prisma.venue.findUnique.mockResolvedValue({
        id: 'v1',
        ownerUserId: 'owner',
        documentType: args.data.documentType,
        documentDigits: args.data.documentDigits,
      });
      return args.data;
    });
    const saved = await venues.saveFiscalDocument('owner', 'v1', {
      documentType: 'CPF',
      documentNumber: '123.456.789-09',
    });
    expect(prisma.venue.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { documentType: 'CPF', documentDigits: CPF },
    });
    expect(saved.documentDigits).toBe(CPF);
    expect(JSON.stringify(saved)).not.toContain('123.456.789-09');
  });

  it('documento duplicado responde sem o número e falha de banco não confirma a gravação', async () => {
    const { prisma, venues } = service();
    prisma.venue.findUnique.mockResolvedValue({
      id: 'v1',
      ownerUserId: 'owner',
      documentType: null,
      documentDigits: null,
    });
    prisma.venue.update.mockRejectedValueOnce({
      code: 'P2002',
      meta: { target: ['documentType', 'documentDigits'] },
    });
    await expect(
      venues.saveFiscalDocument('owner', 'v1', {
        documentType: 'CNPJ',
        documentNumber: '11.444.777/0001-61',
      }),
    ).rejects.toMatchObject({ message: VENUE_DOCUMENT_TAKEN });
    prisma.venue.update.mockRejectedValueOnce(new Error('db down'));
    await expect(
      venues.saveFiscalDocument('owner', 'v1', {
        documentType: 'CPF',
        documentNumber: CPF,
      }),
    ).rejects.toThrow('db down');
    expect(prisma.venue.findUnique).not.toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ documentDigits: CNPJ }),
      }),
    );
  });
});

describe('conflict exception text', () => {
  it('não inclui o documento na mensagem de duplicidade', () => {
    const error = new ConflictException(VENUE_DOCUMENT_TAKEN);
    expect(error.message).toBe(VENUE_DOCUMENT_TAKEN);
    expect(error.message).not.toMatch(/\d{11}/);
  });
});

import { ConflictException } from '@nestjs/common';
import { VenueDocumentType } from '@prisma/client';
import { assertVenueDocumentAvailableForOwner } from './venue-document-policy';
import { VENUE_DOCUMENT_TAKEN } from './venue-document';

describe('venue document policy', () => {
  it('allows when no conflicting rows exist', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    await expect(
      assertVenueDocumentAvailableForOwner(
        tx as never,
        'owner-a',
        { documentType: VenueDocumentType.CNPJ, documentDigits: '11444777000161' },
      ),
    ).resolves.toBeUndefined();
  });

  it('allows when only the same owner uses the document', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'v1', ownerUserId: 'owner-a' }]),
    };
    await expect(
      assertVenueDocumentAvailableForOwner(
        tx as never,
        'owner-a',
        { documentType: VenueDocumentType.CNPJ, documentDigits: '11444777000161' },
        'v2',
      ),
    ).resolves.toBeUndefined();
  });

  it('blocks when another owner already uses the document', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'v1', ownerUserId: 'owner-b' }]),
    };
    await expect(
      assertVenueDocumentAvailableForOwner(
        tx as never,
        'owner-a',
        { documentType: VenueDocumentType.CNPJ, documentDigits: '11444777000161' },
      ),
    ).rejects.toMatchObject({ response: { message: VENUE_DOCUMENT_TAKEN } });
    await expect(
      assertVenueDocumentAvailableForOwner(
        tx as never,
        'owner-a',
        { documentType: VenueDocumentType.CNPJ, documentDigits: '11444777000161' },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

import { ConflictException } from '@nestjs/common';
import {
  claimBannerPublicationIdempotency,
  hashBannerCreateRequest,
} from './banner-create-idempotency';

describe('hashBannerCreateRequest', () => {
  it('ordena datas e ignora diferença de ordem', () => {
    const a = hashBannerCreateRequest({
      imageUrl: 'https://cdn/a.jpg',
      dates: ['2026-10-02', '2026-10-01'],
      vipDates: [],
    });
    const b = hashBannerCreateRequest({
      imageUrl: 'https://cdn/a.jpg',
      dates: ['2026-10-01', '2026-10-02'],
      vipDates: [],
    });
    expect(a).toBe(b);
  });
});

describe('claimBannerPublicationIdempotency', () => {
  function memoryTx() {
    const rows = new Map<
      string,
      { requestHash: string; status: 'PROCESSING' | 'COMPLETED'; bannerId: string | null }
    >();
    const banners = new Map<string, { id: string; schedules: unknown[] }>();
    return {
      rows,
      tx: {
        bannerPublicationIdempotency: {
          create: jest.fn(async ({ data }: { data: { venueId: string; idempotencyKey: string; requestHash: string } }) => {
            const key = `${data.venueId}:${data.idempotencyKey}`;
            if (rows.has(key)) {
              const err = new Error('unique') as Error & { code: string };
              err.code = 'P2002';
              throw err;
            }
            rows.set(key, {
              requestHash: data.requestHash,
              status: 'PROCESSING',
              bannerId: null,
            });
          }),
          findUnique: jest.fn(async ({ where }: { where: { venueId_idempotencyKey: { venueId: string; idempotencyKey: string } } }) => {
            const key = `${where.venueId_idempotencyKey.venueId}:${where.venueId_idempotencyKey.idempotencyKey}`;
            return rows.get(key) ?? null;
          }),
          update: jest.fn(async ({ where, data }: { where: { venueId_idempotencyKey: { venueId: string; idempotencyKey: string } }; data: { status: 'COMPLETED'; bannerId: string } }) => {
            const key = `${where.venueId_idempotencyKey.venueId}:${where.venueId_idempotencyKey.idempotencyKey}`;
            const row = rows.get(key);
            if (row) {
              row.status = data.status;
              row.bannerId = data.bannerId;
            }
          }),
        },
        banner: {
          findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
            return banners.get(where.id) ?? null;
          }),
        },
      },
      seedBanner(id: string) {
        banners.set(id, { id, schedules: [] });
      },
    };
  }

  it('primeira chave cria', async () => {
    const { tx } = memoryTx();
    await expect(
      claimBannerPublicationIdempotency(tx, {
        venueId: 'venue-1',
        idempotencyKey: 'a'.repeat(16),
        requestHash: 'hash-a',
      }),
    ).resolves.toEqual({ kind: 'create' });
  });

  it('mesma chave concluída devolve replay', async () => {
    const { tx, rows, seedBanner } = memoryTx();
    const key = 'b'.repeat(16);
    rows.set('venue-1:' + key, {
      requestHash: 'hash-b',
      status: 'COMPLETED',
      bannerId: 'banner-1',
    });
    seedBanner('banner-1');
    const claim = await claimBannerPublicationIdempotency(tx, {
      venueId: 'venue-1',
      idempotencyKey: key,
      requestHash: 'hash-b',
    });
    expect(claim.kind).toBe('replay');
  });

  it('mesma chave com hash diferente conflita', async () => {
    const { tx, rows } = memoryTx();
    const key = 'c'.repeat(16);
    rows.set('venue-1:' + key, {
      requestHash: 'hash-old',
      status: 'COMPLETED',
      bannerId: 'banner-1',
    });
    await expect(
      claimBannerPublicationIdempotency(tx, {
        venueId: 'venue-1',
        idempotencyKey: key,
        requestHash: 'hash-new',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

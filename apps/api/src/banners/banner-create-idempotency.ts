import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';

export type BannerWithSchedules = Prisma.BannerGetPayload<{
  include: { schedules: true };
}>;
import { PromoContentKind } from '../promo-push/promo-push.copy';
import { VipPublicationPlan } from '../promo-push/vip-push-timing';

const KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export function normalizeBannerIdempotencyKey(
  key: string | undefined | null,
): string | undefined {
  const trimmed = key?.trim();
  if (!trimmed) return undefined;
  if (!KEY_PATTERN.test(trimmed)) {
    throw new BadRequestException('Chave de idempotência inválida');
  }
  return trimmed;
}

/** Stable fingerprint of a publication attempt (server-side truth). */
export function hashBannerCreateRequest(input: {
  imageUrl: string;
  dates: string[];
  vipDates: string[];
  vipPublications?: VipPublicationPlan[];
  title?: string;
  description?: string;
  contentKind?: PromoContentKind | null;
}): string {
  const dates = [...input.dates].map((d) => d.trim()).sort();
  const vipDates = [...input.vipDates].map((d) => d.trim()).sort();
  const vipPublications = [...(input.vipPublications ?? [])]
    .map((p) => ({ date: p.date.trim(), pushTiming: p.pushTiming }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const canonical = JSON.stringify({
    imageUrl: input.imageUrl.trim(),
    dates,
    vipDates,
    vipPublications,
    title: input.title?.trim() ?? '',
    description: input.description?.trim() ?? '',
    contentKind: input.contentKind ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

type IdempotencyTx = {
  bannerPublicationIdempotency: {
    create(args: {
      data: {
        venueId: string;
        idempotencyKey: string;
        requestHash: string;
        status: 'PROCESSING';
      };
    }): Promise<unknown>;
    findUnique(args: {
      where: { venueId_idempotencyKey: { venueId: string; idempotencyKey: string } };
    }): Promise<{
      requestHash: string;
      status: 'PROCESSING' | 'COMPLETED';
      bannerId: string | null;
    } | null>;
    update(args: {
      where: { venueId_idempotencyKey: { venueId: string; idempotencyKey: string } };
      data: { status: 'COMPLETED'; bannerId: string };
    }): Promise<unknown>;
  };
  banner: {
    findUnique(args: {
      where: { id: string };
      include: { schedules: true };
    }): Promise<BannerWithSchedules | null>;
  };
};

export type IdempotencyClaim =
  | { kind: 'create' }
  | { kind: 'replay'; banner: BannerWithSchedules };

/**
 * Claims an idempotency slot inside the same Prisma transaction as the debit.
 * Concurrent duplicates with the same key: one proceeds, others see PROCESSING
 * or COMPLETED (replay) without a second debit.
 */
const IDEMPOTENCY_SAVEPOINT = 'banner_idem_claim';

type IdempotencyTxClient = IdempotencyTx & {
  $executeRawUnsafe?: (query: string) => Promise<unknown>;
};

async function idempotencySavepoint(tx: IdempotencyTxClient): Promise<void> {
  if (typeof tx.$executeRawUnsafe === 'function') {
    await tx.$executeRawUnsafe(`SAVEPOINT ${IDEMPOTENCY_SAVEPOINT}`);
  }
}

async function releaseIdempotencySavepoint(tx: IdempotencyTxClient): Promise<void> {
  if (typeof tx.$executeRawUnsafe === 'function') {
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${IDEMPOTENCY_SAVEPOINT}`);
  }
}

async function rollbackIdempotencySavepoint(tx: IdempotencyTxClient): Promise<void> {
  if (typeof tx.$executeRawUnsafe === 'function') {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${IDEMPOTENCY_SAVEPOINT}`);
  }
}

export async function claimBannerPublicationIdempotency(
  tx: IdempotencyTxClient,
  input: {
    venueId: string;
    idempotencyKey: string;
    requestHash: string;
  },
): Promise<IdempotencyClaim> {
  await idempotencySavepoint(tx);
  try {
    await tx.bannerPublicationIdempotency.create({
      data: {
        venueId: input.venueId,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        status: 'PROCESSING',
      },
    });
    await releaseIdempotencySavepoint(tx);
    return { kind: 'create' };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    await rollbackIdempotencySavepoint(tx);
    const existing = await tx.bannerPublicationIdempotency.findUnique({
      where: {
        venueId_idempotencyKey: {
          venueId: input.venueId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (!existing) {
      throw new ConflictException(
        'Publicação em andamento. Tente novamente em instantes.',
      );
    }
    if (existing.requestHash !== input.requestHash) {
      throw new ConflictException(
        'Esta chave de idempotência já foi usada com outro conteúdo.',
      );
    }
    if (existing.status === 'COMPLETED' && existing.bannerId) {
      const banner = await tx.banner.findUnique({
        where: { id: existing.bannerId },
        include: { schedules: true },
      });
      if (!banner) {
        throw new ConflictException(
          'Publicação original indisponível. Use uma nova chave.',
        );
      }
      return { kind: 'replay', banner };
    }
    throw new ConflictException(
      'Publicação em andamento. Tente novamente em instantes.',
    );
  }
}

export async function completeBannerPublicationIdempotency(
  tx: IdempotencyTx,
  input: { venueId: string; idempotencyKey: string; bannerId: string },
): Promise<void> {
  await tx.bannerPublicationIdempotency.update({
    where: {
      venueId_idempotencyKey: {
        venueId: input.venueId,
        idempotencyKey: input.idempotencyKey,
      },
    },
    data: { status: 'COMPLETED', bannerId: input.bannerId },
  });
}

function isUniqueViolation(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    return true;
  }
  return (
    typeof error === 'object' &&
    error != null &&
    (error as { code?: string }).code === 'P2002'
  );
}

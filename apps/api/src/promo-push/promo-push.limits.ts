import { BadRequestException } from '@nestjs/common';

/** Limits chosen so title + description fit collapsed mobile push notifications. */
export const PROMO_PUBLICATION_TITLE_MAX = 20;
export const PROMO_PUBLICATION_DESCRIPTION_MAX = 60;

export function assertBannerCopyForPush(
  title: string | undefined,
  description: string | undefined,
): void {
  const t = title?.trim() ?? '';
  const d = description?.trim() ?? '';
  if (t.length > PROMO_PUBLICATION_TITLE_MAX) {
    throw new BadRequestException(
      `O título da promoção deve ter no máximo ${PROMO_PUBLICATION_TITLE_MAX} caracteres (aviso push).`,
    );
  }
  if (d.length > PROMO_PUBLICATION_DESCRIPTION_MAX) {
    throw new BadRequestException(
      `A descrição deve ter no máximo ${PROMO_PUBLICATION_DESCRIPTION_MAX} caracteres (aviso push).`,
    );
  }
}
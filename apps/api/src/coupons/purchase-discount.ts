import { BadRequestException } from '@nestjs/common';
import {
  CreditCouponKind,
  PurchaseDiscountType,
  type CreditCoupon,
} from '@prisma/client';

const MIN_PAID_BRL = 0.01;

export function roundMoneyBrl(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computePurchaseDiscount(
  listPriceBrl: number,
  discountType: PurchaseDiscountType,
  discountPercent: number | null,
  discountAmountBrl: number | null,
): { discountAmountBrl: number; amountPaidBrl: number } {
  const list = roundMoneyBrl(listPriceBrl);
  if (list < MIN_PAID_BRL) {
    throw new BadRequestException('Preço do pacote inválido.');
  }
  let discount: number;
  if (discountType === PurchaseDiscountType.PERCENT) {
    const pct = discountPercent ?? 0;
    if (!Number.isInteger(pct) || pct < 1 || pct > 100) {
      throw new BadRequestException('Percentual de desconto inválido.');
    }
    discount = roundMoneyBrl((list * pct) / 100);
  } else {
    const fixed = roundMoneyBrl(discountAmountBrl ?? 0);
    if (fixed <= 0) {
      throw new BadRequestException('Valor de desconto inválido.');
    }
    discount = Math.min(fixed, roundMoneyBrl(list - MIN_PAID_BRL));
  }
  if (discount <= 0) {
    throw new BadRequestException('O desconto não se aplica a este pacote.');
  }
  const amountPaidBrl = roundMoneyBrl(list - discount);
  if (amountPaidBrl < MIN_PAID_BRL) {
    throw new BadRequestException('O desconto deixaria o valor abaixo do mínimo.');
  }
  return { discountAmountBrl: discount, amountPaidBrl };
}

export function assertDiscountCouponShape(coupon: CreditCoupon): void {
  if (coupon.kind !== CreditCouponKind.PURCHASE_DISCOUNT) {
    throw new BadRequestException(
      'Este cupom concede créditos. Use o resgate de cupom, não o checkout.',
    );
  }
  if (!coupon.discountType) {
    throw new BadRequestException('Cupom de desconto mal configurado.');
  }
  if (coupon.discountType === PurchaseDiscountType.PERCENT) {
    const pct = coupon.discountPercent;
    if (pct == null || pct < 1 || pct > 100) {
      throw new BadRequestException('Cupom de desconto mal configurado.');
    }
    return;
  }
  if (coupon.discountAmountBrl == null) {
    throw new BadRequestException('Cupom de desconto mal configurado.');
  }
}

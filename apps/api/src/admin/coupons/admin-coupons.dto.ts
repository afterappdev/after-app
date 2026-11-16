import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export const COUPON_CREDIT_KINDS = ['COMMON', 'VIP'] as const;
export type CouponCreditKindDto = (typeof COUPON_CREDIT_KINDS)[number];

export const COUPON_KINDS = ['CREDIT_GRANT', 'PURCHASE_DISCOUNT'] as const;
export type CouponKindDto = (typeof COUPON_KINDS)[number];

export const PURCHASE_DISCOUNT_TYPES = ['PERCENT', 'FIXED_BRL'] as const;
export type PurchaseDiscountTypeDto = (typeof PURCHASE_DISCOUNT_TYPES)[number];

function optionalInt({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

export class AdminCouponsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class AdminCreateCouponDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code!: string;

  @IsOptional()
  @IsIn(COUPON_KINDS)
  kind?: CouponKindDto;

  @ValidateIf((dto: AdminCreateCouponDto) => (dto.kind ?? 'CREDIT_GRANT') === 'CREDIT_GRANT')
  @Type(() => Number)
  @IsInt()
  @Min(1)
  creditAmount?: number;

  @IsOptional()
  @IsIn(COUPON_CREDIT_KINDS)
  creditKind?: CouponCreditKindDto;

  @ValidateIf((dto: AdminCreateCouponDto) => dto.kind === 'PURCHASE_DISCOUNT')
  @IsIn(PURCHASE_DISCOUNT_TYPES)
  discountType?: PurchaseDiscountTypeDto;

  @ValidateIf(
    (dto: AdminCreateCouponDto) =>
      dto.kind === 'PURCHASE_DISCOUNT' && dto.discountType === 'PERCENT',
  )
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  discountPercent?: number;

  @ValidateIf(
    (dto: AdminCreateCouponDto) =>
      dto.kind === 'PURCHASE_DISCOUNT' && dto.discountType === 'FIXED_BRL',
  )
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  discountAmountBrl?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  startsAt?: string | null;

  @IsOptional()
  @IsString()
  expiresAt?: string | null;

  @IsOptional()
  @Transform(optionalInt)
  @IsInt()
  @Min(1)
  maxRedemptions?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxRedemptionsPerVenue?: number;
}

export class AdminCouponWriteDto {
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  startsAt?: string | null;

  @IsOptional()
  @IsString()
  expiresAt?: string | null;

  @IsOptional()
  @Transform(optionalInt)
  @IsInt()
  @Min(1)
  maxRedemptions?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxRedemptionsPerVenue?: number;
}
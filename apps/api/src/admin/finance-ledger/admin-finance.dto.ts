import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  AdminFinanceCategory,
  AdminFinanceDirection,
} from '@prisma/client';

export class AdminFinanceQueryDto {
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

  @IsString()
  @MinLength(7)
  yearMonth!: string;
}

export class AdminFinanceOverviewQueryDto {
  @IsString()
  @MinLength(7)
  yearMonth!: string;
}

export class AdminFinanceCreateDto {
  @IsEnum(AdminFinanceDirection)
  direction!: AdminFinanceDirection;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  description!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amountBrl!: number;

  @IsEnum(AdminFinanceCategory)
  category!: AdminFinanceCategory;

  @IsString()
  @MinLength(10)
  occurredAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class AppleWebExchangeDto {
  @IsString()
  @MinLength(16)
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9_-]+$/)
  code!: string;
}

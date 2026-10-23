import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { WEB_REGISTRATION_CHANNEL } from '../registration-profile';
import { AGE_BAND_INVALID, AGE_BANDS } from '../../users/age-band';

/** Public signup may only create consumer accounts. ADMIN is seed-only. */
export const PUBLIC_REGISTER_ROLES = ['USER', 'VENUE'] as const;
export type PublicRegisterRole = (typeof PUBLIC_REGISTER_ROLES)[number];

export class RegisterDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  @MinLength(2)
  state!: string;

  @IsString()
  @MinLength(2)
  city!: string;

  @IsIn(PUBLIC_REGISTER_ROLES)
  role!: PublicRegisterRole;

  /** Required by the service when role is VENUE. Ignored for a common user. */
  @IsOptional()
  @IsIn(['CPF', 'CNPJ'])
  documentType?: 'CPF' | 'CNPJ';

  @IsOptional()
  @IsString()
  @MaxLength(18)
  documentNumber?: string;

  /** Required by the service when role is USER. Ignored for a venue when omitted. */
  @IsOptional()
  @IsIn(AGE_BANDS, { message: AGE_BAND_INVALID })
  ageBand?: (typeof AGE_BANDS)[number];

  /** After Web only. Native store builds must not send this. */
  @IsOptional()
  @IsIn([WEB_REGISTRATION_CHANNEL])
  registrationChannel?: typeof WEB_REGISTRATION_CHANNEL;
}

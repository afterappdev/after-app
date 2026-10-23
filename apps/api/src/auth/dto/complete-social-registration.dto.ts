import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { WEB_REGISTRATION_CHANNEL } from '../registration-profile';
import { AGE_BAND_INVALID, AGE_BANDS } from '../../users/age-band';

export class CompleteSocialRegistrationDto {
  @IsString()
  @MinLength(20)
  onboardingToken!: string;

  @IsIn(['user', 'venue'])
  accountType!: 'user' | 'venue';

  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  state!: string;

  @IsString()
  @MinLength(2)
  city!: string;

  @IsOptional()
  @ValidateIf((_, value) => value != null && value !== '')
  @IsString()
  @MinLength(6)
  password?: string;

  /** Required by the service when accountType is venue. Ignored for a user. */
  @IsOptional()
  @IsIn(['CPF', 'CNPJ'])
  documentType?: 'CPF' | 'CNPJ';

  @IsOptional()
  @IsString()
  @MaxLength(18)
  documentNumber?: string;

  /** Required by the service when accountType is user. Ignored for a venue when omitted. */
  @IsOptional()
  @IsIn(AGE_BANDS, { message: AGE_BAND_INVALID })
  ageBand?: (typeof AGE_BANDS)[number];

  @IsOptional()
  @IsIn([WEB_REGISTRATION_CHANNEL])
  registrationChannel?: typeof WEB_REGISTRATION_CHANNEL;
}

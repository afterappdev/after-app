import {
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

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
}

import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SubmitVenueClaimDto {
  @IsString()
  @MaxLength(200)
  requesterName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  requesterRole!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(32)
  whatsapp!: string;
}

export class ApproveVenueClaimDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  approvedEmail?: string;

  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;
}

export class VenueClaimInviteTokenDto {
  @IsString()
  @MinLength(16)
  token!: string;
}

export class VenueClaimCompleteDto {
  @IsString()
  @MinLength(16)
  token!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(12)
  code!: string;
}

export class VenueClaimSignupCompleteDto extends VenueClaimCompleteDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
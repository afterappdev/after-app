import { IsOptional, IsString, MinLength } from 'class-validator';

export class AppleLoginDto {
  @IsString()
  @MinLength(20)
  identityToken!: string;

  @IsOptional()
  @IsString()
  authorizationCode?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  fullName?: string;
}

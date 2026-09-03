import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterAdminPushTokenDto {
  @IsString()
  @MinLength(16)
  @MaxLength(4096)
  token!: string;

  @IsIn(['android', 'ios'])
  platform!: 'android' | 'ios';
}

export class UnregisterAdminPushTokenDto {
  @IsString()
  @MinLength(16)
  @MaxLength(4096)
  token!: string;
}

import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';

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
}

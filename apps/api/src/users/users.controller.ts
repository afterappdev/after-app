import { Body, Controller, Delete, Get, Patch, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';

class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  city?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  state?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}

class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.usersService.getMe(user.userId);
  }

  @Patch('me')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateUserDto) {
    return this.usersService.updateMe(user.userId, dto);
  }

  @Patch('me/password')
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(
      user.userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @Delete('me')
  deleteMe(@CurrentUser() user: AuthUser) {
    return this.usersService.deleteAccount(user.userId);
  }
}

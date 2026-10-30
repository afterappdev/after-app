import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { AccountRecoveryAuthGuard } from '../auth/account-recovery-auth.guard';
import { DeletionScopeAuthGuard } from '../auth/deletion-scope-auth.guard';
import { SessionJwtAuthGuard } from '../auth/session-jwt-auth.guard';
import { AGE_BAND_INVALID, AGE_BANDS } from './age-band';
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

  @IsOptional()
  @IsIn(AGE_BANDS, { message: AGE_BAND_INVALID })
  ageBand?: (typeof AGE_BANDS)[number];
}

class SetActiveVenueDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  venueId!: string;
}

class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;
}

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(SessionJwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.usersService.getMe(user.userId);
  }

  @Get('me/venues')
  @UseGuards(SessionJwtAuthGuard)
  myVenues(@CurrentUser() user: AuthUser) {
    return this.usersService.listMyVenues(user.userId);
  }

  @Put('me/active-venue')
  @UseGuards(SessionJwtAuthGuard)
  setActiveVenue(
    @CurrentUser() user: AuthUser,
    @Body() dto: SetActiveVenueDto,
  ) {
    return this.usersService.setActiveVenue(user.userId, dto.venueId);
  }

  @Patch('me')
  @UseGuards(SessionJwtAuthGuard)
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateUserDto) {
    return this.usersService.updateMe(user.userId, dto);
  }

  @Patch('me/password')
  @UseGuards(SessionJwtAuthGuard)
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

  @Post('me/deletion-request')
  @UseGuards(SessionJwtAuthGuard)
  requestDeletion(@CurrentUser() user: AuthUser) {
    return this.usersService.requestAccountDeletion(user.userId);
  }

  @Post('me/deletion-cancel')
  @UseGuards(AccountRecoveryAuthGuard)
  cancelDeletion(@CurrentUser() user: AuthUser) {
    return this.usersService.cancelAccountDeletion(user.userId);
  }

  @Get('me/deletion-status')
  @UseGuards(DeletionScopeAuthGuard)
  deletionStatus(@CurrentUser() user: AuthUser) {
    return this.usersService.getDeletionStatus(user.userId);
  }

  @Delete('me')
  @UseGuards(SessionJwtAuthGuard)
  deleteMe(@CurrentUser() user: AuthUser) {
    return this.usersService.deleteAccount(user.userId);
  }

  @Get('me/blocked-venues')
  @UseGuards(SessionJwtAuthGuard)
  listBlockedVenues(@CurrentUser() user: AuthUser) {
    return this.usersService.listBlockedVenues(user);
  }

  @Post('me/blocked-venues/:venueId')
  @UseGuards(SessionJwtAuthGuard)
  blockVenue(
    @CurrentUser() user: AuthUser,
    @Param('venueId') venueId: string,
  ) {
    return this.usersService.blockVenue(user, venueId);
  }

  @Delete('me/blocked-venues/:venueId')
  @UseGuards(SessionJwtAuthGuard)
  unblockVenue(
    @CurrentUser() user: AuthUser,
    @Param('venueId') venueId: string,
  ) {
    return this.usersService.unblockVenue(user, venueId);
  }
}

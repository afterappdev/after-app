import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminOnly } from '../admin/guards/admin-only.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UseGuards } from '@nestjs/common';
import {
  ApproveVenueClaimDto,
  SubmitVenueClaimDto,
  VenueClaimCompleteDto,
  VenueClaimInviteTokenDto,
  VenueClaimSignupCompleteDto,
} from './venue-claims.dto';
import { VenueClaimsService } from './venue-claims.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@Controller()
export class VenueClaimsController {
  constructor(private readonly claims: VenueClaimsService) {}

  @Post('venues/:venueId/claim-requests')
  submit(@Param('venueId') venueId: string, @Body() dto: SubmitVenueClaimDto) {
    return this.claims.submit(venueId, dto);
  }

  @Get('admin/venue-claims')
  @AdminOnly()
  list(@Query('status') status?: string) {
    return this.claims.listForAdmin(status);
  }

  @Post('admin/venue-claims/:claimId/reject')
  @AdminOnly()
  reject(
    @Param('claimId') claimId: string,
    @CurrentUser('userId') adminUserId: string,
  ) {
    return this.claims.reject(claimId, adminUserId);
  }

  @Post('admin/venue-claims/:claimId/approve')
  @AdminOnly()
  approve(
    @Param('claimId') claimId: string,
    @CurrentUser('userId') adminUserId: string,
    @Body() dto: ApproveVenueClaimDto,
  ) {
    return this.claims.approveInvite(claimId, adminUserId, dto);
  }

  @Post('admin/venue-claims/:claimId/revoke-invite')
  @AdminOnly()
  revokeInvite(
    @Param('claimId') claimId: string,
    @CurrentUser('userId') adminUserId: string,
  ) {
    return this.claims.revokeInvite(claimId, adminUserId);
  }

  @Get('venue-claims/invite/preview')
  previewInvite(@Query('token') token: string) {
    return this.claims.previewInvite(token);
  }

  @Post('venue-claims/invite/send-code')
  sendInviteCode(@Body() dto: VenueClaimInviteTokenDto) {
    return this.claims.sendInviteEmailCode(dto.token);
  }

  @Post('venue-claims/invite/complete')
  @UseGuards(JwtAuthGuard)
  completeInvite(
    @Body() dto: VenueClaimCompleteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.claims.completeInviteAccept(dto.token, dto.code, user.userId);
  }

  @Post('venue-claims/invite/complete-signup')
  completeInviteSignup(@Body() dto: VenueClaimSignupCompleteDto) {
    return this.claims.completeInviteAcceptWithSignup(dto.token, dto.code, {
      name: dto.name,
      password: dto.password,
    });
  }
}
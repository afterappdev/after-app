import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AccountLifecycleStatus } from '@prisma/client';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ACCOUNT_RECOVERY_TYP } from '../users/account-recovery';
import {
  assertNormalSessionJwt,
  assertSessionNotInvalidated,
  SessionJwtPayload,
} from './session-jwt';
import { SOCIAL_ONBOARDING_TYP } from './social-onboarding';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: SessionJwtPayload): Promise<AuthUser> {
    if (
      payload.typ === SOCIAL_ONBOARDING_TYP ||
      !payload.sub ||
      !payload.email ||
      !payload.role
    ) {
      throw new UnauthorizedException();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        accountStatus: true,
        sessionInvalidatedAt: true,
        sessionVersion: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException();
    }

    if (payload.typ === ACCOUNT_RECOVERY_TYP) {
      if (user.accountStatus !== AccountLifecycleStatus.PENDING_DELETION) {
        throw new UnauthorizedException();
      }
      assertSessionNotInvalidated(payload, user.sessionInvalidatedAt);
      return {
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
        tokenScope: 'recovery',
      };
    }

    if (
      user.accountStatus === AccountLifecycleStatus.PENDING_DELETION ||
      user.accountStatus === AccountLifecycleStatus.PURGED
    ) {
      throw new UnauthorizedException();
    }
    assertNormalSessionJwt(payload, user);

    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      tokenScope: 'session',
    };
  }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { SOCIAL_ONBOARDING_TYP } from './social-onboarding';

type JwtPayload = {
  sub?: string;
  email?: string;
  role?: 'USER' | 'VENUE' | 'ADMIN';
  typ?: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: JwtPayload): AuthUser {
    if (
      payload.typ === SOCIAL_ONBOARDING_TYP ||
      !payload.sub ||
      !payload.email ||
      !payload.role
    ) {
      throw new UnauthorizedException();
    }
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }
}

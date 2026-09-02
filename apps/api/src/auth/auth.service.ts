import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, PurchaseStatus } from '@prisma/client';
import appleSignin from 'apple-signin-auth';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { VENUE_SIGNUP_BONUS_CREDITS } from '../common/constants/credits';
import { PrismaService } from '../prisma/prisma.service';
import { AppleLoginDto } from './dto/apple-login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { CompleteSocialRegistrationDto } from './dto/complete-social-registration.dto';
import {
  attachOAuthOnboarding,
  attachOAuthToken,
  isAllowedOAuthRedirect,
  parseAllowedRedirectOrigins,
  parseAudienceList,
} from './oauth.util';
import {
  SOCIAL_EMAIL_TAKEN_MESSAGE,
  SOCIAL_ONBOARDING_EXPIRED_MESSAGE,
  SOCIAL_ONBOARDING_INVALID_MESSAGE,
  SOCIAL_ONBOARDING_TTL_SECONDS,
  SOCIAL_ONBOARDING_TYP,
  SOCIAL_ONBOARDING_USED_MESSAGE,
  type SocialOnboardingJwtPayload,
  type SocialProvider,
} from './social-onboarding';
import { isProduction } from '../common/env';

type OAuthStatePayload = {
  redirect: string;
  provider: 'google' | 'apple';
};

type AuthUserRecord = {
  id: string;
  name: string;
  email: string;
  role: Role;
  state: string;
  city: string;
  avatarUrl: string | null;
  venue: { id: string } | null;
};

type SocialProfileInput = {
  provider: SocialProvider;
  providerId: string;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
};

type SocialAuthResult =
  | {
      needsRegistration: true;
      onboardingToken: string;
      profile: {
        provider: SocialProvider;
        email: string;
        name: string;
        avatarUrl: string | null;
      };
    }
  | {
      accessToken: string;
      user: {
        id: string;
        name: string;
        email: string;
        role: Role;
        state: string;
        city: string;
        avatarUrl: string | null;
        venueId: string | null;
      };
    };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  providers() {
    return {
      google: this.googleAudiences().length > 0,
      googleBrowser: Boolean(this.googleWebClientId() && this.googleClientSecret()),
      apple: true,
      appleBrowser: Boolean(this.appleServiceId()),
    };
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException('E-mail já cadastrado');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email.toLowerCase(),
        passwordHash,
        state: dto.state,
        city: dto.city,
        role: dto.role,
        ...(dto.role === Role.VENUE
          ? this.venueCreateNested(dto.name, dto.city, dto.state)
          : {}),
      },
      include: { venue: true },
    });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { venue: true },
    });
    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    return this.buildAuthResponse(user);
  }

  async loginWithGoogle(dto: GoogleLoginDto) {
    const payload = await this.verifyGoogleIdToken(dto.idToken);
    return this.resolveSocialLogin({
      provider: 'google',
      providerId: payload.sub,
      email: payload.email,
      name: payload.name,
      avatarUrl: payload.picture,
    });
  }

  async loginWithApple(dto: AppleLoginDto) {
    const payload = await this.verifyAppleIdToken(dto.identityToken);
    return this.resolveSocialLogin({
      provider: 'apple',
      providerId: payload.sub,
      email: payload.email || dto.email,
      name: dto.fullName,
    });
  }

  async completeSocialRegistration(dto: CompleteSocialRegistrationDto) {
    const payload = this.readSocialOnboardingToken(dto.onboardingToken);
    const role = dto.accountType === 'venue' ? Role.VENUE : Role.USER;
    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, 10)
      : await bcrypt.hash(randomBytes(32).toString('hex'), 10);

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const consumed = await tx.socialOnboardingToken.updateMany({
          where: {
            id: payload.jti,
            usedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { usedAt: new Date() },
        });
        if (consumed.count !== 1) {
          const existing = await tx.socialOnboardingToken.findUnique({
            where: { id: payload.jti },
          });
          if (!existing) {
            throw new UnauthorizedException(SOCIAL_ONBOARDING_INVALID_MESSAGE);
          }
          if (existing.usedAt) {
            throw new UnauthorizedException(SOCIAL_ONBOARDING_USED_MESSAGE);
          }
          throw new UnauthorizedException(SOCIAL_ONBOARDING_EXPIRED_MESSAGE);
        }

        const row = await tx.socialOnboardingToken.findUnique({
          where: { id: payload.jti },
        });
        if (!row) {
          throw new UnauthorizedException(SOCIAL_ONBOARDING_INVALID_MESSAGE);
        }
        if (
          row.provider !== payload.provider ||
          row.providerId !== payload.providerId ||
          row.email !== payload.email
        ) {
          throw new UnauthorizedException(SOCIAL_ONBOARDING_INVALID_MESSAGE);
        }

        const providerData =
          row.provider === 'google'
            ? { googleId: row.providerId }
            : { appleId: row.providerId };

        return tx.user.create({
          data: {
            name: dto.name.trim(),
            email: row.email,
            passwordHash,
            state: dto.state,
            city: dto.city,
            role,
            avatarUrl: row.avatarUrl,
            ...providerData,
            ...(role === Role.VENUE
              ? this.venueCreateNested(dto.name.trim(), dto.city, dto.state)
              : {}),
          },
          include: { venue: true },
        });
      });

      return this.buildAuthResponse(user);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'P2002') {
        throw new ConflictException(
          'Não foi possível concluir o cadastro. Tente novamente.',
        );
      }
      throw error;
    }
  }

  googleStartUrl(redirect: string): string {
    const clientId = this.googleWebClientId();
    const secret = this.googleClientSecret();
    if (!clientId || !secret) {
      throw new ServiceUnavailableException(
        'Login com Google não configurado. Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET na API.',
      );
    }

    const safeRedirect = this.requireRedirect(redirect);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: this.googleCallbackUrl(),
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'online',
      prompt: 'select_account',
      state: this.signOAuthState({ redirect: safeRedirect, provider: 'google' }),
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async googleCallback(code: string | undefined, state: string | undefined) {
    if (!code || !state) {
      throw new BadRequestException('Callback do Google inválido.');
    }

    const { redirect } = this.readOAuthState(state, 'google');
    const clientId = this.googleWebClientId();
    const secret = this.googleClientSecret();
    if (!clientId || !secret) {
      throw new ServiceUnavailableException(
        'Login com Google não configurado.',
      );
    }

    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: secret,
      redirect_uri: this.googleCallbackUrl(),
      grant_type: 'authorization_code',
    });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const tokenJson = (await tokenRes.json()) as {
      id_token?: string;
      error?: string;
    };
    if (!tokenRes.ok || !tokenJson.id_token) {
      throw new UnauthorizedException(
        'Não foi possível concluir o login com Google.',
      );
    }

    const payload = await this.verifyGoogleIdToken(tokenJson.id_token);
    const result = await this.resolveSocialLogin({
      provider: 'google',
      providerId: payload.sub,
      email: payload.email,
      name: payload.name,
      avatarUrl: payload.picture,
    });

    return this.attachSocialRedirect(redirect, result);
  }

  oauthCancelRedirect(state: string | undefined) {
    if (state) {
      try {
        const payload = this.jwt.verify<OAuthStatePayload>(state);
        return this.requireRedirect(payload.redirect);
      } catch {
        // cai no fallback seguro
      }
    }
    const origins = this.oauthAllowedOrigins();
    return origins[0] ? `${origins[0]}/` : 'http://localhost:8080/';
  }

  appleStartUrl(redirect: string): string {
    const serviceId = this.appleServiceId();
    if (!serviceId) {
      throw new ServiceUnavailableException(
        'Login com Apple na web não configurado. Defina APPLE_SERVICE_ID na API.',
      );
    }

    const safeRedirect = this.requireRedirect(redirect);
    const params = new URLSearchParams({
      client_id: serviceId,
      redirect_uri: this.appleCallbackUrl(),
      response_type: 'code id_token',
      response_mode: 'form_post',
      scope: 'name email',
      state: this.signOAuthState({ redirect: safeRedirect, provider: 'apple' }),
    });

    return `https://appleid.apple.com/auth/authorize?${params.toString()}`;
  }

  async appleCallback(body: {
    id_token?: string;
    state?: string;
    user?: string;
  }) {
    if (!body.id_token || !body.state) {
      throw new BadRequestException('Callback da Apple inválido.');
    }

    const { redirect } = this.readOAuthState(body.state, 'apple');
    const payload = await this.verifyAppleIdToken(body.id_token);
    let fullName: string | undefined;
    if (body.user) {
      try {
        const parsed = JSON.parse(body.user) as {
          name?: { firstName?: string; lastName?: string };
          email?: string;
        };
        fullName = [parsed.name?.firstName, parsed.name?.lastName]
          .filter(Boolean)
          .join(' ');
      } catch {
        fullName = undefined;
      }
    }

    const result = await this.resolveSocialLogin({
      provider: 'apple',
      providerId: payload.sub,
      email: payload.email,
      name: fullName,
    });

    return this.attachSocialRedirect(redirect, result);
  }

  private async verifyGoogleIdToken(idToken: string) {
    const audiences = this.googleAudiences();
    if (!audiences.length) {
      throw new ServiceUnavailableException(
        'Login com Google não configurado. Defina GOOGLE_CLIENT_ID na API.',
      );
    }

    try {
      const client = new OAuth2Client();
      const ticket = await client.verifyIdToken({
        idToken,
        audience: audiences,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub) {
        throw new UnauthorizedException('Token do Google inválido.');
      }
      if (!payload.email || payload.email_verified === false) {
        throw new UnauthorizedException(
          'A conta Google não possui e-mail verificado.',
        );
      }
      return {
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      throw new UnauthorizedException('Token do Google inválido.');
    }
  }

  private async verifyAppleIdToken(identityToken: string) {
    const audiences = parseAudienceList(
      this.config.get<string>('APPLE_BUNDLE_ID'),
      this.appleServiceId(),
    );
    if (!audiences.length) {
      throw new ServiceUnavailableException(
        'Login com Apple não configurado. Defina APPLE_BUNDLE_ID na API.',
      );
    }

    try {
      const payload = await appleSignin.verifyIdToken(identityToken, {
        audience: audiences,
        ignoreExpiration: false,
      });
      if (!payload.sub) {
        throw new UnauthorizedException('Token da Apple inválido.');
      }
      return {
        sub: payload.sub,
        email: payload.email as string | undefined,
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      throw new UnauthorizedException('Token da Apple inválido.');
    }
  }

  private attachSocialRedirect(redirect: string, result: SocialAuthResult) {
    if ('onboardingToken' in result) {
      return attachOAuthOnboarding(redirect, result.onboardingToken);
    }
    return attachOAuthToken(redirect, result.accessToken);
  }

  private async resolveSocialLogin(
    input: SocialProfileInput,
  ): Promise<SocialAuthResult> {
    const user = await this.findUserByProvider(input.provider, input.providerId);
    if (user) {
      return this.buildAuthResponse(user);
    }

    let email = input.email?.trim().toLowerCase() || null;
    let name = input.name?.trim() || '';
    let avatarUrl = input.avatarUrl ?? null;

    if (!email) {
      const pending = await this.prisma.socialOnboardingToken.findFirst({
        where: {
          provider: input.provider,
          providerId: input.providerId,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (pending) {
        email = pending.email;
        name = name || pending.name;
        avatarUrl = avatarUrl || pending.avatarUrl;
      }
    }

    if (!email) {
      throw new UnauthorizedException(
        'Não foi possível obter o e-mail da conta. Autorize o e-mail no próximo login.',
      );
    }

    const existingByEmail = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingByEmail) {
      throw new ConflictException(SOCIAL_EMAIL_TAKEN_MESSAGE);
    }

    const displayName = name || email.split('@')[0];
    const onboardingToken = await this.issueSocialOnboardingToken({
      provider: input.provider,
      providerId: input.providerId,
      email,
      name: displayName,
      avatarUrl,
    });

    return {
      needsRegistration: true,
      onboardingToken,
      profile: {
        provider: input.provider,
        email,
        name: displayName,
        avatarUrl,
      },
    };
  }

  private async findUserByProvider(provider: SocialProvider, providerId: string) {
    return provider === 'google'
      ? this.prisma.user.findUnique({
          where: { googleId: providerId },
          include: { venue: true },
        })
      : this.prisma.user.findUnique({
          where: { appleId: providerId },
          include: { venue: true },
        });
  }

  private async issueSocialOnboardingToken(input: {
    provider: SocialProvider;
    providerId: string;
    email: string;
    name: string;
    avatarUrl: string | null;
  }) {
    const expiresAt = new Date(Date.now() + SOCIAL_ONBOARDING_TTL_SECONDS * 1000);
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.socialOnboardingToken.updateMany({
        where: {
          provider: input.provider,
          providerId: input.providerId,
          usedAt: null,
        },
        data: { usedAt: new Date() },
      });
      return tx.socialOnboardingToken.create({
        data: {
          provider: input.provider,
          providerId: input.providerId,
          email: input.email,
          name: input.name,
          avatarUrl: input.avatarUrl,
          expiresAt,
        },
      });
    });

    return this.jwt.sign(
      {
        typ: SOCIAL_ONBOARDING_TYP,
        jti: row.id,
        provider: input.provider,
        providerId: input.providerId,
        email: input.email,
        name: input.name,
        avatarUrl: input.avatarUrl,
      },
      { expiresIn: '15m' },
    );
  }

  private readSocialOnboardingToken(token: string): SocialOnboardingJwtPayload {
    try {
      const payload = this.jwt.verify<SocialOnboardingJwtPayload>(token);
      if (
        payload.typ !== SOCIAL_ONBOARDING_TYP ||
        !payload.jti ||
        (payload.provider !== 'google' && payload.provider !== 'apple') ||
        !payload.providerId ||
        !payload.email
      ) {
        throw new UnauthorizedException(SOCIAL_ONBOARDING_INVALID_MESSAGE);
      }
      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      const name = (error as { name?: string }).name;
      if (name === 'TokenExpiredError') {
        throw new UnauthorizedException(SOCIAL_ONBOARDING_EXPIRED_MESSAGE);
      }
      throw new UnauthorizedException(SOCIAL_ONBOARDING_INVALID_MESSAGE);
    }
  }

  private venueCreateNested(name: string, city: string, state: string) {
    return {
      venue: {
        create: {
          name,
          city,
          state,
          wallet: { create: { balance: VENUE_SIGNUP_BONUS_CREDITS } },
          purchases: {
            create: {
              packageKey: 'welcome',
              amountPaid: 0,
              credits: VENUE_SIGNUP_BONUS_CREDITS,
              status: PurchaseStatus.PAID,
            },
          },
        },
      },
    };
  }

  private requireRedirect(redirect: string | undefined) {
    if (!redirect) {
      throw new BadRequestException('Redirect OAuth ausente.');
    }
    if (
      !isAllowedOAuthRedirect(redirect, this.oauthAllowedOrigins(), {
        production: isProduction(),
      })
    ) {
      throw new BadRequestException('Redirect OAuth não permitido.');
    }
    return redirect;
  }

  private oauthAllowedOrigins() {
    return parseAllowedRedirectOrigins(
      this.config.get<string>('OAUTH_REDIRECT_ORIGINS'),
      this.config.get<string>('PUBLIC_APP_URL'),
    );
  }

  private signOAuthState(payload: OAuthStatePayload) {
    return this.jwt.sign(payload, { expiresIn: '10m' });
  }

  private readOAuthState(state: string, provider: 'google' | 'apple') {
    try {
      const payload = this.jwt.verify<OAuthStatePayload>(state);
      if (payload.provider !== provider || !payload.redirect) {
        throw new BadRequestException('Estado OAuth inválido.');
      }
      this.requireRedirect(payload.redirect);
      return payload;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Estado OAuth expirado ou inválido.');
    }
  }

  private googleAudiences() {
    return parseAudienceList(
      this.googleWebClientId(),
      this.config.get<string>('GOOGLE_CLIENT_IDS'),
    );
  }

  private googleWebClientId() {
    return this.config.get<string>('GOOGLE_CLIENT_ID')?.trim() || '';
  }

  private googleClientSecret() {
    return this.config.get<string>('GOOGLE_CLIENT_SECRET')?.trim() || '';
  }

  private appleServiceId() {
    return this.config.get<string>('APPLE_SERVICE_ID')?.trim() || '';
  }

  private publicApiUrl() {
    return (
      this.config.get<string>('PUBLIC_API_URL')?.replace(/\/$/, '') ||
      `http://localhost:${this.config.get('PORT') ?? 3000}`
    );
  }

  private googleCallbackUrl() {
    return (
      this.config.get<string>('GOOGLE_REDIRECT_URI')?.trim() ||
      `${this.publicApiUrl()}/auth/google/callback`
    );
  }

  private appleCallbackUrl() {
    return (
      this.config.get<string>('APPLE_REDIRECT_URI')?.trim() ||
      `${this.publicApiUrl()}/auth/apple/callback`
    );
  }

  private buildAuthResponse(user: AuthUserRecord) {
    const accessToken = this.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        state: user.state,
        city: user.city,
        avatarUrl: user.avatarUrl,
        venueId: user.venue?.id ?? null,
      },
    };
  }
}

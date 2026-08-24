import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
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
import {
  attachOAuthToken,
  isAllowedOAuthRedirect,
  parseAudienceList,
} from './oauth.util';

const SOCIAL_DEFAULT_STATE = 'SP';
const SOCIAL_DEFAULT_CITY = 'São Paulo';

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
          ? {
              venue: {
                create: {
                  name: dto.name,
                  city: dto.city,
                  state: dto.state,
                  wallet: { create: { balance: VENUE_SIGNUP_BONUS_CREDITS } },
                  purchases: {
                    create: {
                      packageKey: 'welcome',
                      amountPaid: 0,
                      credits: VENUE_SIGNUP_BONUS_CREDITS,
                      status: 'PAID',
                    },
                  },
                },
              },
            }
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
    return this.upsertSocialUser({
      provider: 'google',
      providerId: payload.sub,
      email: payload.email,
      name: payload.name,
      avatarUrl: payload.picture,
    });
  }

  async loginWithApple(dto: AppleLoginDto) {
    const payload = await this.verifyAppleIdToken(dto.identityToken);
    return this.upsertSocialUser({
      provider: 'apple',
      providerId: payload.sub,
      email: dto.email || payload.email,
      name: dto.fullName,
    });
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
    const auth = await this.upsertSocialUser({
      provider: 'google',
      providerId: payload.sub,
      email: payload.email,
      name: payload.name,
      avatarUrl: payload.picture,
    });

    return attachOAuthToken(redirect, auth.accessToken);
  }

  oauthCancelRedirect(state: string | undefined) {
    if (!state) {
      return this.config.get<string>('OAUTH_REDIRECT_ORIGINS')?.split(',')[0]?.trim() ||
        'http://localhost:8080/';
    }
    try {
      const payload = this.jwt.verify<OAuthStatePayload>(state);
      return payload.redirect;
    } catch {
      return 'http://localhost:8080/';
    }
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

    const auth = await this.upsertSocialUser({
      provider: 'apple',
      providerId: payload.sub,
      email: payload.email,
      name: fullName,
    });

    return attachOAuthToken(redirect, auth.accessToken);
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

  private async upsertSocialUser(input: {
    provider: 'google' | 'apple';
    providerId: string;
    email?: string | null;
    name?: string | null;
    avatarUrl?: string | null;
  }) {
    const email = input.email?.trim().toLowerCase() || null;
    const providerData =
      input.provider === 'google'
        ? { googleId: input.providerId }
        : { appleId: input.providerId };

    let user =
      input.provider === 'google'
        ? await this.prisma.user.findUnique({
            where: { googleId: input.providerId },
            include: { venue: true },
          })
        : await this.prisma.user.findUnique({
            where: { appleId: input.providerId },
            include: { venue: true },
          });

    if (!user && email) {
      user = await this.prisma.user.findUnique({
        where: { email },
        include: { venue: true },
      });
      if (user) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            ...providerData,
            avatarUrl: user.avatarUrl ?? input.avatarUrl ?? undefined,
          },
          include: { venue: true },
        });
      }
    }

    if (!user) {
      if (!email) {
        throw new UnauthorizedException(
          'Não foi possível obter o e-mail da conta. Autorize o e-mail no próximo login.',
        );
      }
      const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
      user = await this.prisma.user.create({
        data: {
          name: input.name?.trim() || email.split('@')[0],
          email,
          passwordHash,
          role: Role.USER,
          state: SOCIAL_DEFAULT_STATE,
          city: SOCIAL_DEFAULT_CITY,
          avatarUrl: input.avatarUrl ?? null,
          ...providerData,
        },
        include: { venue: true },
      });
    }

    return this.buildAuthResponse(user);
  }

  private requireRedirect(redirect: string | undefined) {
    if (!redirect) {
      throw new BadRequestException('Redirect OAuth ausente.');
    }
    const extra = parseAudienceList(
      this.config.get<string>('OAUTH_REDIRECT_ORIGINS'),
    );
    if (!isAllowedOAuthRedirect(redirect, extra)) {
      throw new BadRequestException('Redirect OAuth não permitido.');
    }
    return redirect;
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

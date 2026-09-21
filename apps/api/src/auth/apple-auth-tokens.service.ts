import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import appleSignin from 'apple-signin-auth';
import {
  createAppleClientSecret,
  normalizeApplePrivateKey,
  sanitizeAppleLogError,
} from './apple-web.util';
import {
  APPLE_TOKEN_ENCRYPTION_KEY_ENV,
  decryptAppleRefreshToken,
  encryptAppleRefreshToken,
  parseAppleTokenEncryptionKey,
} from './apple-token.crypto';

export const APPLE_REVOKE_UNAVAILABLE_MESSAGE =
  'Não foi possível concluir a exclusão agora. Tente novamente em instantes.';

export type AppleRevocableAuth = {
  refreshToken: string;
  clientId: string;
};

export type AppleStoredAuth = {
  appleId?: string | null;
  appleRefreshTokenEnc?: string | null;
  appleClientId?: string | null;
};

type AppleTokenErrorBody = {
  error?: string;
  error_description?: string;
  status?: number;
};

@Injectable()
export class AppleAuthTokensService implements OnModuleInit {
  private readonly logger = new Logger(AppleAuthTokensService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    if (!this.appleServerAuthConfigured()) return;
    this.encryptionKey();
  }

  encryptRefreshToken(token: string): string {
    return encryptAppleRefreshToken(token, this.encryptionKey());
  }

  decryptRefreshToken(payload: string | null | undefined): string | null {
    return decryptAppleRefreshToken(payload, this.encryptionKey());
  }

  storedFromRevocable(
    creds: AppleRevocableAuth | undefined,
  ): { appleRefreshTokenEnc: string; appleClientId: string } | undefined {
    if (!creds?.refreshToken || !creds.clientId) return undefined;
    return {
      appleRefreshTokenEnc: this.encryptRefreshToken(creds.refreshToken),
      appleClientId: creds.clientId,
    };
  }

  async exchangeNativeCode(
    code: string,
  ): Promise<AppleRevocableAuth | undefined> {
    const clientId = this.appleBundleId();
    if (!code.trim() || !this.canSignClientSecret() || !clientId) {
      return undefined;
    }
    try {
      const tokens = await this.postAppleToken({
        grant_type: 'authorization_code',
        code: code.trim(),
        client_id: clientId,
        client_secret: this.clientSecretFor(clientId),
      });
      if (!tokens.refresh_token) return undefined;
      return { refreshToken: tokens.refresh_token, clientId };
    } catch (error) {
      this.logger.warn(
        `Apple native token exchange skipped: ${sanitizeAppleLogError(error)}`,
      );
      return undefined;
    }
  }

  async revokeForAccount(user: AppleStoredAuth): Promise<void> {
    if (!user.appleId) return;
    if (!user.appleRefreshTokenEnc || !user.appleClientId) {
      this.logger.warn(
        'Apple account deletion without a stored refresh token; proceeding',
      );
      return;
    }

    const refreshToken = this.decryptRefreshToken(user.appleRefreshTokenEnc);
    if (!refreshToken) {
      this.logger.warn(
        'Apple refresh token could not be decrypted; proceeding without revoke',
      );
      return;
    }

    if (!this.canSignClientSecret()) {
      this.logger.warn(
        'Apple revoke skipped: client secret is not configured; proceeding',
      );
      return;
    }

    try {
      await appleSignin.revokeAuthorizationToken(refreshToken, {
        clientID: user.appleClientId,
        clientSecret: this.clientSecretFor(user.appleClientId),
        tokenTypeHint: 'refresh_token',
      });
    } catch (error) {
      const kind = classifyAppleRevokeError(error);
      this.logger.warn(`Apple token revoke: ${kind} ${sanitizeAppleLogError(error)}`);
      if (kind === 'already_revoked' || kind === 'config') {
        return;
      }
      throw new ServiceUnavailableException(APPLE_REVOKE_UNAVAILABLE_MESSAGE);
    }
  }

  private async postAppleToken(body: Record<string, string>): Promise<{
    refresh_token?: string;
    access_token?: string;
    id_token?: string;
  }> {
    const res = await fetch('https://appleid.apple.com/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    });
    const json = (await res.json()) as {
      refresh_token?: string;
      access_token?: string;
      id_token?: string;
      error?: string;
    };
    if (!res.ok || json.error) {
      const err = new Error('apple_token_exchange_failed');
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    return json;
  }

  private clientSecretFor(clientId: string): string {
    return createAppleClientSecret({
      teamId: this.appleTeamId(),
      clientId,
      keyId: this.appleKeyId(),
      privateKey: this.applePrivateKey(),
    });
  }

  private canSignClientSecret(): boolean {
    return Boolean(
      this.appleTeamId() && this.appleKeyId() && this.applePrivateKey(),
    );
  }

  private encryptionKey() {
    return parseAppleTokenEncryptionKey(
      this.config.get<string>(APPLE_TOKEN_ENCRYPTION_KEY_ENV),
    );
  }

  private appleServerAuthConfigured(): boolean {
    return this.canSignClientSecret();
  }

  private appleBundleId() {
    return this.config.get<string>('APPLE_BUNDLE_ID')?.trim() || '';
  }

  private appleTeamId() {
    return this.config.get<string>('APPLE_TEAM_ID')?.trim() || '';
  }

  private appleKeyId() {
    return this.config.get<string>('APPLE_KEY_ID')?.trim() || '';
  }

  private applePrivateKey() {
    return normalizeApplePrivateKey(
      this.config.get<string>('APPLE_PRIVATE_KEY'),
    );
  }
}

export function classifyAppleRevokeError(
  error: unknown,
): 'already_revoked' | 'config' | 'transient' {
  const body = appleErrorBody(error);
  const code = (body.error || '').toLowerCase();
  const status = body.status ?? httpStatus(error);

  if (
    code === 'invalid_grant' ||
    code === 'invalid_token' ||
    status === 400
  ) {
    if (code === 'invalid_client') return 'config';
    return 'already_revoked';
  }
  if (code === 'invalid_client' || status === 401) {
    return 'config';
  }
  return 'transient';
}

function httpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const record = error as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
  };
  const value = record.status ?? record.statusCode ?? record.response?.status;
  return typeof value === 'number' ? value : undefined;
}

function appleErrorBody(error: unknown): AppleTokenErrorBody {
  if (!error || typeof error !== 'object') return {};
  const record = error as AppleTokenErrorBody & {
    response?: { data?: AppleTokenErrorBody; status?: number };
    data?: AppleTokenErrorBody;
  };
  return {
    error: record.error || record.data?.error || record.response?.data?.error,
    error_description:
      record.error_description ||
      record.data?.error_description ||
      record.response?.data?.error_description,
    status: httpStatus(error) ?? record.response?.status,
  };
}

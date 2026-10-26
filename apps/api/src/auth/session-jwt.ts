import { UnauthorizedException } from '@nestjs/common';

/** Claim on normal session access tokens (not recovery / onboarding / admin specials). */
export const SESSION_VERSION_CLAIM = 'sv';

export type SessionJwtPayload = {
  sub?: string;
  email?: string;
  role?: 'USER' | 'VENUE' | 'ADMIN';
  typ?: string;
  iat?: number;
  sv?: number;
};

export function sessionVersionFromPayload(payload: SessionJwtPayload): number | undefined {
  const raw = payload.sv;
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
    throw new UnauthorizedException();
  }
  return raw;
}

/** Validates normal session JWTs (not recovery). Recovery uses [assertRecoverySessionNotInvalidated]. */
export function assertNormalSessionJwt(
  payload: SessionJwtPayload,
  user: {
    sessionVersion: number;
    sessionInvalidatedAt: Date | null;
  },
): void {
  const claimSv = sessionVersionFromPayload(payload);
  if (claimSv !== undefined) {
    if (claimSv !== user.sessionVersion) {
      throw new UnauthorizedException();
    }
    return;
  }
  if (user.sessionVersion > 0) {
    throw new UnauthorizedException();
  }
  assertSessionNotInvalidated(payload, user.sessionInvalidatedAt);
}

export function assertSessionNotInvalidated(
  payload: SessionJwtPayload,
  sessionInvalidatedAt: Date | null,
): void {
  if (!sessionInvalidatedAt || payload.iat == null) {
    return;
  }
  const issuedAtMs = payload.iat * 1000;
  if (issuedAtMs <= sessionInvalidatedAt.getTime()) {
    throw new UnauthorizedException();
  }
}

export function buildSessionJwtPayload(user: {
  id: string;
  email: string;
  role: string;
  sessionVersion: number;
}) {
  return {
    sub: user.id,
    email: user.email,
    role: user.role,
    sv: user.sessionVersion,
  };
}

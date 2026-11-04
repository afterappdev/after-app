import type { AuthUser } from '../../api/types/auth'

export type GuardPhase = 'loading' | 'guest' | 'ok' | 'wrong_role'

export function sessionGuardPhase(
  bootstrapping: boolean,
  user: AuthUser | null,
): GuardPhase {
  if (bootstrapping) return 'loading'
  if (!user) return 'guest'
  return 'ok'
}

export function userGuardPhase(
  bootstrapping: boolean,
  user: AuthUser | null,
): GuardPhase {
  const phase = sessionGuardPhase(bootstrapping, user)
  if (phase !== 'ok' || !user) return phase
  return user.role === 'USER' ? 'ok' : 'wrong_role'
}

export function venueGuardPhase(
  bootstrapping: boolean,
  user: AuthUser | null,
  venueId: string | null,
): GuardPhase {
  const phase = sessionGuardPhase(bootstrapping, user)
  if (phase !== 'ok' || !user) return phase
  return user.role === 'VENUE' && venueId ? 'ok' : 'wrong_role'
}

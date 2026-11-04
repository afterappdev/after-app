export type PendingSocialOnboarding = {
  onboardingToken: string
  email?: string
  name?: string
}

const KEY = 'after.web.social.onboarding'

export function savePendingSocialOnboarding(data: PendingSocialOnboarding): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    /* ignore */
  }
}

export function readPendingSocialOnboarding(): PendingSocialOnboarding | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingSocialOnboarding
    if (!parsed?.onboardingToken) return null
    return parsed
  } catch {
    return null
  }
}

export function clearPendingSocialOnboarding(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export function pendingSocialFromAuthResponse(data: Record<string, unknown>): PendingSocialOnboarding | null {
  if (data.needsRegistration !== true) return null
  const token = String(data.onboardingToken ?? '')
  if (!token) return null
  const profile =
    data.profile && typeof data.profile === 'object'
      ? (data.profile as Record<string, unknown>)
      : null
  return {
    onboardingToken: token,
    email: profile?.email != null ? String(profile.email) : undefined,
    name: profile?.name != null ? String(profile.name) : undefined,
  }
}

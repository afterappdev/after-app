export const SOCIAL_ONBOARDING_TYP = 'social_onboarding' as const;

export const SOCIAL_ONBOARDING_TTL_SECONDS = 15 * 60;

export const SOCIAL_ONBOARDING_TTL_MS = SOCIAL_ONBOARDING_TTL_SECONDS * 1000;

export const SOCIAL_ONBOARDING_EXPIRED_MESSAGE =
  'Token de cadastro expirado.';

export const SOCIAL_ONBOARDING_INVALID_MESSAGE =
  'Token de cadastro inválido.';

export const SOCIAL_ONBOARDING_USED_MESSAGE =
  'Token de cadastro já utilizado.';

export const SOCIAL_EMAIL_TAKEN_MESSAGE =
  'Já existe uma conta com este e-mail. Entre com e-mail e senha.';

export const SOCIAL_GOOGLE_EMAIL_UNVERIFIED_MESSAGE =
  'Não foi possível entrar com Google porque o e-mail não está verificado.';

export const SOCIAL_GOOGLE_IDENTITY_CONFLICT_MESSAGE =
  'Esta conta já está vinculada a outro Google. Entre com e-mail e senha.';

export type SocialProvider = 'google' | 'apple';

export type SocialOnboardingJwtPayload = {
  typ: typeof SOCIAL_ONBOARDING_TYP;
  jti: string;
  provider: SocialProvider;
  providerId: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
};

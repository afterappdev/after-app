export const ACCOUNT_RECOVERY_TYP = 'account_recovery' as const;

/** Short-lived token for cancel/status while the account is pending deletion. */
export const ACCOUNT_RECOVERY_TTL_SECONDS = 15 * 60;

export const ACCOUNT_DELETION_GRACE_DAYS = 30;

export const ACCOUNT_DELETION_GRACE_MS =
  ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000;

export const ACCOUNT_PURGE_IN_PROGRESS_MESSAGE =
  'A exclusão definitiva já está em andamento.';

export const ACCOUNT_DELETION_NOT_PENDING_MESSAGE =
  'Esta conta não está aguardando exclusão.';

export const ACCOUNT_DELETION_GRACE_EXPIRED_MESSAGE =
  'O prazo para recuperar a conta já terminou.';

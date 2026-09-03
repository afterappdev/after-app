export type AdminPushPayload = {
  title: string;
  body: string;
  data: Record<string, string>;
};

export type AdminPushSendResult = {
  token: string;
  success: boolean;
  invalid: boolean;
};

export interface FirebaseMessagingPort {
  readonly configured: boolean;
  sendToTokens(
    tokens: string[],
    message: AdminPushPayload,
  ): Promise<AdminPushSendResult[]>;
}

export const FIREBASE_MESSAGING_PORT = 'FIREBASE_MESSAGING_PORT';

export class NoopFirebaseMessaging implements FirebaseMessagingPort {
  readonly configured = false;

  sendToTokens(): Promise<AdminPushSendResult[]> {
    return Promise.resolve([]);
  }
}

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-recipient',
]);

export function isInvalidFcmTokenCode(code: string | undefined): boolean {
  if (!code) return false;
  return INVALID_TOKEN_CODES.has(code);
}

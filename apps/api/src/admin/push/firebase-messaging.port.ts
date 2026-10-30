export type AdminPushPayload = {
  title: string;
  body: string;
  data: Record<string, string>;
  /** Optional. Admin messages omit it, so their multicast shape stays the same. */
  collapseKey?: string;
  androidChannelId?: string;
  /** Optional HTTPS image (VIP venue logo). Omitted when invalid or absent. */
  imageUrl?: string;
};

export type FcmMulticastMessage = {
  tokens: string[];
  notification: { title: string; body: string; imageUrl?: string };
  data: Record<string, string>;
  android: {
    priority: 'high';
    collapseKey?: string;
    notification?: { channelId?: string; imageUrl?: string };
  };
  apns: {
    headers?: Record<string, string>;
    payload: { aps: { sound: 'default' } };
  };
  webpush?: { headers: { Topic: string; Urgency: 'high' } };
};

/** Builds the multicast body. Without collapse/channel, the admin payload is unchanged. */
export function buildFcmMulticast(
  tokens: string[],
  message: AdminPushPayload,
): FcmMulticastMessage {
  const collapseKey = message.collapseKey?.trim() || undefined;
  const channelId = message.androidChannelId?.trim() || undefined;
  const imageUrl = message.imageUrl?.trim() || undefined;
  const android: FcmMulticastMessage['android'] = { priority: 'high' };
  if (collapseKey) android.collapseKey = collapseKey;
  if (channelId || imageUrl) {
    android.notification = {
      ...(channelId ? { channelId } : {}),
      ...(imageUrl ? { imageUrl } : {}),
    };
  }
  const apns: FcmMulticastMessage['apns'] = {
    payload: { aps: { sound: 'default' } },
  };
  if (collapseKey) {
    apns.headers = { 'apns-collapse-id': collapseKey };
  }
  const built: FcmMulticastMessage = {
    tokens,
    notification: {
      title: message.title,
      body: message.body,
      ...(imageUrl ? { imageUrl } : {}),
    },
    data: message.data,
    android,
    apns,
  };
  if (collapseKey) {
    built.webpush = { headers: { Topic: collapseKey, Urgency: 'high' } };
  }
  return built;
}

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

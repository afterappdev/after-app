import { Logger } from '@nestjs/common';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import {
  AdminPushPayload,
  AdminPushSendResult,
  FirebaseMessagingPort,
  NoopFirebaseMessaging,
  isInvalidFcmTokenCode,
} from './firebase-messaging.port';

type ServiceAccountJson = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

function parseServiceAccount(
  raw: string,
  logger: Logger,
): ServiceAccountJson | null {
  try {
    const parsed = JSON.parse(raw) as ServiceAccountJson;
    if (typeof parsed.private_key === 'string') {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      logger.warn(
        'FCM desabilitado: FIREBASE_SERVICE_ACCOUNT_JSON sem project_id/client_email/private_key.',
      );
      return null;
    }
    return parsed;
  } catch {
    logger.warn('FCM desabilitado: FIREBASE_SERVICE_ACCOUNT_JSON inválido.');
    return null;
  }
}

class FirebaseAdminMessaging implements FirebaseMessagingPort {
  readonly configured = true;

  constructor(
    private readonly app: App,
    private readonly logger: Logger,
  ) {}

  async sendToTokens(
    tokens: string[],
    message: AdminPushPayload,
  ): Promise<AdminPushSendResult[]> {
    if (tokens.length === 0) return [];
    const messaging = getMessaging(this.app);
    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: message.title,
        body: message.body,
      },
      data: message.data,
      android: {
        priority: 'high',
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
          },
        },
      },
    });

    return tokens.map((token, index) => {
      const item = response.responses[index];
      const code = item?.error?.code;
      if (item?.success) {
        return { token, success: true, invalid: false };
      }
      if (code) {
        this.logger.warn(`FCM token rejected (${code})`);
      }
      return {
        token,
        success: false,
        invalid: isInvalidFcmTokenCode(code),
      };
    });
  }
}

export function createFirebaseMessagingPort(
  logger = new Logger('AdminFcm'),
): FirebaseMessagingPort {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    logger.warn(
      'FCM desabilitado: FIREBASE_SERVICE_ACCOUNT_JSON não configurado. A API segue no ar sem push.',
    );
    return new NoopFirebaseMessaging();
  }

  const account = parseServiceAccount(raw, logger);
  if (!account) return new NoopFirebaseMessaging();

  try {
    const existing = getApps().find((app) => app.name === 'after-admin-fcm');
    const app =
      existing ??
      initializeApp(
        {
          credential: cert({
            projectId: account.project_id,
            clientEmail: account.client_email,
            privateKey: account.private_key,
          }),
          projectId: account.project_id,
        },
        'after-admin-fcm',
      );
    return new FirebaseAdminMessaging(app, logger);
  } catch {
    logger.warn('FCM desabilitado: falha ao inicializar Firebase Admin SDK.');
    return new NoopFirebaseMessaging();
  }
}

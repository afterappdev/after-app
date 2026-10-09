import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  Environment,
  InAppOwnershipType,
  JWSTransactionDecodedPayload,
  SignedDataVerifier,
  Type,
  VerificationException,
  VerificationStatus,
} from '@apple/app-store-server-library';
import { isProduction } from '../../common/env';
import {
  StorePaymentProvider,
  StoreVerifyInput,
  VerifiedPayment,
} from './payment-provider';
import { appleRootCertificates } from './apple-root-certificates';

const APPLE_TEMPORARY_MESSAGE =
  'A Apple está indisponível no momento. Tente novamente em instantes.';
const APPLE_PRODUCTION_CONFIG_MESSAGE =
  'Verificação da App Store em produção não configurada no servidor.';
const LEGACY_TEMPORARY_STATUSES = new Set([21005, 21009]);
const JWS_COMPACT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export type AppleReceiptResponse = Record<string, unknown>;

export type AppleReceiptRequest = (
  receiptData: string,
  password: string,
  sandbox: boolean,
) => Promise<AppleReceiptResponse>;

export type AppleSignedTransactionVerifier = {
  verifyAndDecodeTransaction(
    signedTransaction: string,
  ): Promise<JWSTransactionDecodedPayload>;
};

export type AppleAppStoreRuntime = {
  rootCertificates?: Buffer[];
  enableOnlineChecks?: boolean;
  verifierFor?: (
    environment: Environment,
    bundleId: string,
    appAppleId: number | undefined,
  ) => AppleSignedTransactionVerifier;
  receiptRequest?: AppleReceiptRequest;
};

export function isStoreKit2SignedTransaction(value: string): boolean {
  const trimmed = value.trim();
  if (!JWS_COMPACT.test(trimmed)) return false;
  try {
    const header = JSON.parse(
      Buffer.from(trimmed.split('.')[0], 'base64url').toString('utf8'),
    ) as { alg?: unknown };
    return typeof header.alg === 'string' && header.alg.length > 0;
  } catch {
    return false;
  }
}

function appleBundleId(): string {
  return process.env.APPLE_BUNDLE_ID?.trim() || 'com.r2p.after.afterApp';
}

function appleAppAppleId(): number | undefined {
  const raw = process.env.APPLE_APP_APPLE_ID?.trim();
  if (!raw) return undefined;
  if (!/^[1-9]\d+$/.test(raw)) {
    throw new BadRequestException(APPLE_PRODUCTION_CONFIG_MESSAGE);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new BadRequestException(APPLE_PRODUCTION_CONFIG_MESSAGE);
  }
  return value;
}

function peekSignedEnvironment(jws: string): string | undefined {
  try {
    const json = JSON.parse(
      Buffer.from(jws.trim().split('.')[1], 'base64url').toString('utf8'),
    ) as { environment?: unknown };
    return typeof json.environment === 'string' ? json.environment : undefined;
  } catch {
    return undefined;
  }
}

function temporaryAppleFailure(): ServiceUnavailableException {
  return new ServiceUnavailableException(APPLE_TEMPORARY_MESSAGE);
}

@Injectable()
export class AppleAppStorePaymentProvider implements StorePaymentProvider {
  readonly id = 'app_store' as const;
  private readonly logger = new Logger(AppleAppStorePaymentProvider.name);
  private runtime: AppleAppStoreRuntime = {};
  private readonly verifiers = new Map<string, AppleSignedTransactionVerifier>();

  static forTests(runtime: AppleAppStoreRuntime): AppleAppStorePaymentProvider {
    const provider = new AppleAppStorePaymentProvider();
    provider.runtime = runtime;
    return provider;
  }

  get isConfigured(): boolean {
    return Boolean(
      process.env.APPLE_SHARED_SECRET?.trim() ||
        process.env.APPLE_APP_APPLE_ID?.trim(),
    );
  }

  async verify(input: StoreVerifyInput): Promise<VerifiedPayment> {
    if (isStoreKit2SignedTransaction(input.verificationData)) {
      return this.verifySignedTransaction(input);
    }
    return this.verifyLegacyReceipt(input);
  }

  private async verifySignedTransaction(
    input: StoreVerifyInput,
  ): Promise<VerifiedPayment> {
    const bundleId = appleBundleId();
    const hinted = peekSignedEnvironment(input.verificationData);
    if (hinted !== Environment.SANDBOX && hinted !== Environment.PRODUCTION) {
      throw new BadRequestException('Transação Apple inválida.');
    }
    const order =
      hinted === Environment.PRODUCTION
        ? [Environment.PRODUCTION, Environment.SANDBOX]
        : [Environment.SANDBOX, Environment.PRODUCTION];

    let sawEnvironmentMismatch = false;
    for (const environment of order) {
      if (
        environment === Environment.PRODUCTION &&
        appleAppAppleId() === undefined
      ) {
        if (hinted === Environment.PRODUCTION && !sawEnvironmentMismatch) {
          throw new BadRequestException(APPLE_PRODUCTION_CONFIG_MESSAGE);
        }
        continue;
      }
      try {
        const decoded = await this.verifier(
          environment,
          bundleId,
        ).verifyAndDecodeTransaction(input.verificationData.trim());
        return acceptSignedTransaction(decoded, input, bundleId);
      } catch (error) {
        if (
          error instanceof VerificationException &&
          error.status === VerificationStatus.INVALID_ENVIRONMENT
        ) {
          sawEnvironmentMismatch = true;
          continue;
        }
        if (
          error instanceof BadRequestException ||
          error instanceof ServiceUnavailableException
        ) {
          throw error;
        }
        throw mapVerificationError(error, this.logger);
      }
    }
    throw new BadRequestException('Transação Apple inválida.');
  }

  private verifier(
    environment: Environment,
    bundleId: string,
  ): AppleSignedTransactionVerifier {
    const appAppleId =
      environment === Environment.PRODUCTION ? appleAppAppleId() : undefined;
    if (this.runtime.verifierFor) {
      return this.runtime.verifierFor(environment, bundleId, appAppleId);
    }
    const online = this.runtime.enableOnlineChecks !== false;
    const key = `${environment}|${bundleId}|${appAppleId ?? ''}|${online}`;
    const cached = this.verifiers.get(key);
    if (cached) return cached;
    const created = new SignedDataVerifier(
      this.runtime.rootCertificates ?? appleRootCertificates(),
      online,
      environment,
      bundleId,
      appAppleId,
    );
    this.verifiers.set(key, created);
    return created;
  }

  private async verifyLegacyReceipt(
    input: StoreVerifyInput,
  ): Promise<VerifiedPayment> {
    const secret = process.env.APPLE_SHARED_SECRET?.trim();
    if (!secret) {
      if (!isProduction()) {
        this.logger.warn(
          'APPLE_SHARED_SECRET ausente — aceitando recibo legado em desenvolvimento.',
        );
        return {
          provider: this.id,
          productId: input.productId,
          externalId: input.purchaseId || input.verificationData.slice(0, 64),
        };
      }
      throw new BadRequestException(
        'Verificação da App Store não configurada no servidor.',
      );
    }

    const request = this.runtime.receiptRequest ?? appleVerifyReceipt;
    const payload = await this.requestLegacyReceipt(
      request,
      input.verificationData,
      secret,
      false,
    );
    const body =
      payload.status === 21007
        ? await this.requestLegacyReceipt(
            request,
            input.verificationData,
            secret,
            true,
          )
        : payload;
    if (typeof body.status !== 'number') {
      this.logger.warn('verifyReceipt devolveu resposta sem status numérico.');
      throw temporaryAppleFailure();
    }
    if (LEGACY_TEMPORARY_STATUSES.has(body.status)) {
      this.logger.warn(`verifyReceipt indisponível (status ${body.status}).`);
      throw temporaryAppleFailure();
    }
    if (body.status !== 0) {
      throw new BadRequestException(
        `Recibo Apple inválido (status ${body.status}).`,
      );
    }

    const bundleId = appleBundleId();
    const receiptBundle = (body.receipt as { bundle_id?: string } | undefined)
      ?.bundle_id;
    if (receiptBundle && receiptBundle !== bundleId) {
      throw new BadRequestException('Recibo Apple não pertence a este app.');
    }

    const items = [
      ...((body.latest_receipt_info as Array<Record<string, string>>) ?? []),
      ...(((body.receipt as { in_app?: Array<Record<string, string>> })
        ?.in_app) ?? []),
    ];
    const match = items.find((item) => {
      const pid = item.product_id;
      const tid = item.transaction_id || item.original_transaction_id;
      return (
        pid === input.productId && (!input.purchaseId || tid === input.purchaseId)
      );
    });
    if (!match) {
      throw new BadRequestException('Transação Apple não encontrada no recibo.');
    }
    return {
      provider: this.id,
      productId: input.productId,
      externalId: match.transaction_id || input.purchaseId,
    };
  }

  private async requestLegacyReceipt(
    request: AppleReceiptRequest,
    receiptData: string,
    password: string,
    sandbox: boolean,
  ): Promise<AppleReceiptResponse> {
    try {
      return await request(receiptData, password, sandbox);
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      this.logger.warn(
        `Falha temporária ao consultar verifyReceipt (${sandbox ? 'sandbox' : 'production'}).`,
      );
      throw temporaryAppleFailure();
    }
  }
}

function acceptSignedTransaction(
  decoded: JWSTransactionDecodedPayload,
  input: StoreVerifyInput,
  bundleId: string,
): VerifiedPayment {
  if (decoded.bundleId !== bundleId) {
    throw new BadRequestException('Recibo Apple não pertence a este app.');
  }
  if (
    decoded.environment !== Environment.SANDBOX &&
    decoded.environment !== Environment.PRODUCTION
  ) {
    throw new BadRequestException('Transação Apple inválida.');
  }
  if (decoded.type !== Type.CONSUMABLE) {
    throw new BadRequestException(
      'A transação Apple não é um produto consumível.',
    );
  }
  if (!decoded.productId || decoded.productId !== input.productId) {
    throw new BadRequestException(
      'Transação Apple não corresponde ao produto solicitado.',
    );
  }
  const transactionId = decoded.transactionId?.trim();
  if (!transactionId) {
    throw new BadRequestException('Transação Apple inválida.');
  }
  const purchaseId = input.purchaseId?.trim();
  if (purchaseId && purchaseId !== transactionId) {
    throw new BadRequestException(
      'Transação Apple não corresponde à compra enviada.',
    );
  }
  if (
    decoded.revocationDate != null ||
    (decoded.revocationPercentage ?? 0) > 0
  ) {
    throw new BadRequestException('A transação Apple foi revogada.');
  }
  if (decoded.inAppOwnershipType !== InAppOwnershipType.PURCHASED) {
    throw new BadRequestException('Transação Apple inválida.');
  }
  if (decoded.quantity != null && decoded.quantity !== 1) {
    throw new BadRequestException('Transação Apple inválida.');
  }
  return {
    provider: 'app_store',
    productId: decoded.productId,
    externalId: transactionId,
  };
}

function mapVerificationError(error: unknown, logger: Logger): Error {
  if (error instanceof VerificationException) {
    if (error.status === VerificationStatus.RETRYABLE_VERIFICATION_FAILURE) {
      logger.warn('Validação Apple retryable (OCSP ou rede).');
      return temporaryAppleFailure();
    }
    if (error.status === VerificationStatus.INVALID_APP_IDENTIFIER) {
      return new BadRequestException('Recibo Apple não pertence a este app.');
    }
    return new BadRequestException('Transação Apple inválida.');
  }
  logger.warn('Falha inesperada ao validar transação Apple.');
  return temporaryAppleFailure();
}

async function appleVerifyReceipt(
  receiptData: string,
  password: string,
  sandbox: boolean,
): Promise<AppleReceiptResponse> {
  const host = sandbox
    ? 'https://sandbox.itunes.apple.com/verifyReceipt'
    : 'https://buy.itunes.apple.com/verifyReceipt';
  const res = await fetch(host, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      'receipt-data': receiptData,
      password,
      'exclude-old-transactions': true,
    }),
  });
  if (!res.ok) {
    throw new Error(`verifyReceipt HTTP ${res.status}`);
  }
  return (await res.json()) as AppleReceiptResponse;
}

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';
import { parseEnvFile } from '../src/common/card-test-env';
import { isMercadoPagoSandbox, isProduction } from '../src/common/env';
import { cardRefundReconcileEnabled } from '../src/credits/card-refund.ledger';
import {
  CardObserveStopped,
  observeCardReconciliation,
  parseObservePurchaseId,
  prismaCardObserveDb,
} from '../src/credits/card-reconcile-observe';
import { MercadoPagoOrdersClient } from '../src/credits/providers/mercado-pago-orders';

const ENV_KEYS = [
  'DATABASE_URL',
  'MERCADO_PAGO_ACCESS_TOKEN',
  'MERCADO_PAGO_SANDBOX',
  'CARD_REFUND_RECONCILE_ENABLED',
  'NODE_ENV',
] as const;

function fillMissingEnv(): void {
  let content = '';
  try {
    content = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
  } catch {
    return;
  }
  const parsed = parseEnvFile(content);
  for (const key of ENV_KEYS) {
    if (!process.env[key] && parsed[key]) process.env[key] = parsed[key];
  }
}

async function main(): Promise<void> {
  const purchaseId = parseObservePurchaseId(process.argv);
  fillMissingEnv();
  const prisma = new PrismaClient();
  const client = new MercadoPagoOrdersClient();
  try {
    const report = await observeCardReconciliation({
      purchaseId,
      env: {
        databaseUrl: process.env.DATABASE_URL,
        sandbox: isMercadoPagoSandbox(),
        production: isProduction(),
        reconcileEnabled: cardRefundReconcileEnabled(),
        accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN,
      },
      db: prismaCardObserveDb(prisma),
      http: {
        getCurrentUser: (token, timeoutMs) => client.getCurrentUser(token, { timeoutMs }),
        getOrder: (token, orderId, timeoutMs) =>
          client.getOrder(token, orderId, { timeoutMs }),
      },
    });
    console.log(JSON.stringify(report));
    process.exitCode = report.ok ? 0 : 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  if (error instanceof CardObserveStopped) {
    console.log(
      JSON.stringify({
        ok: false,
        reason: error.reason,
        ...(error.detail ?? {}),
      }),
    );
  } else {
    console.log(JSON.stringify({ ok: false, reason: 'erro' }));
  }
  process.exitCode = 2;
});

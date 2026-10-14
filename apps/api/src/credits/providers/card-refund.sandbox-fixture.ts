import { MercadoPagoOrder } from './mercado-pago-orders';

/** Sanitized Orders API body from the Sandbox partial refund. No payer or card data. */
export const SANDBOX_PARTIAL_PURCHASE_ID = 'cpf127c25c1b96d41208515884dbe15e49';
export const SANDBOX_PARTIAL_ORDER_ID = 'ORDTST01M4EJXGH4C0JXW2Z603Y25GBB';
export const SANDBOX_PARTIAL_PAYMENT_ID = 'PAY01M4EJXGHNSX2VD63J49JWPP0M';
export const SANDBOX_PARTIAL_REFUND_ID = 'REF01M4EK6KKRQ398WDR9BQWEK5Z3';

export function sandboxPartialCardOrder(
  overrides: MercadoPagoOrder = {},
): MercadoPagoOrder {
  const order: MercadoPagoOrder = {
    id: SANDBOX_PARTIAL_ORDER_ID,
    status: 'processed',
    status_detail: 'partially_refunded',
    currency: 'BRL',
    total_amount: '34.90',
    external_reference: SANDBOX_PARTIAL_PURCHASE_ID,
    transactions: {
      payments: [
        {
          id: SANDBOX_PARTIAL_PAYMENT_ID,
          status: 'processed',
          status_detail: 'partially_refunded',
          amount: '34.90',
          paid_amount: '34.90',
          reference_id: '000gjaimq2',
        },
      ],
      refunds: [
        {
          id: SANDBOX_PARTIAL_REFUND_ID,
          status: 'processed',
          amount: '10.00',
          transaction_id: SANDBOX_PARTIAL_PAYMENT_ID,
          reference_id: '01M4EK6KQTX2W142GPKRR1CMXV',
        },
      ],
    },
  };
  return {
    ...order,
    ...overrides,
    transactions: overrides.transactions ?? order.transactions,
  };
}

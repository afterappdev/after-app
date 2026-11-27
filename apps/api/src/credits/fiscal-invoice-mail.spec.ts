import { CreditPurchase } from '@prisma/client';
import { sendResendEmail } from '../common/resend/resend-email';
import {
  FISCAL_INVOICE_TO,
  buildFiscalInvoiceEmail,
  formatFiscalDocument,
  notifyFiscalInvoiceRequest,
} from './fiscal-invoice-mail';

jest.mock('../common/resend/resend-email', () => ({
  isResendConfigured: jest.fn(() => true),
  sendResendEmail: jest.fn().mockResolvedValue(undefined),
}));

const sendResendEmailMock = sendResendEmail as jest.MockedFunction<typeof sendResendEmail>;

function purchase(overrides: Partial<CreditPurchase> = {}): CreditPurchase {
  return {
    id: 'pur_1',
    venueId: 'ven_1',
    packageKey: 'unit_1',
    productId: null,
    amountPaid: { toNumber: () => 34.9 } as CreditPurchase['amountPaid'],
    listPriceBrl: null,
    discountCouponId: null,
    discountCouponCode: null,
    discountAmountBrl: null,
    currency: 'BRL',
    credits: 10,
    provider: 'pix',
    providerTxId: 'pix:1',
    status: 'PAID',
    confirmedAt: new Date('2026-11-13T13:00:00.000Z'),
    invoiceRequested: true,
    fiscalPersonType: 'CNPJ',
    fiscalName: 'Espetaria LTDA',
    fiscalDocument: '11444777000161',
    fiscalEmail: 'fiscal@espetaria.com',
    createdAt: new Date('2026-11-13T12:00:00.000Z'),
    updatedAt: new Date('2026-11-13T13:00:00.000Z'),
    ...overrides,
  } as CreditPurchase;
}

describe('fiscal invoice mail', () => {
  beforeEach(() => {
    sendResendEmailMock.mockClear();
  });

  it('formata CPF e CNPJ', () => {
    expect(formatFiscalDocument('CPF', '12345678909')).toBe('123.456.789-09');
    expect(formatFiscalDocument('CNPJ', '11444777000161')).toBe('11.444.777/0001-61');
  });

  it('monta o e-mail com os dados da nota', () => {
    const message = buildFiscalInvoiceEmail({
      purchase: purchase(),
      venueName: 'Espetaria 017',
      city: 'São José do Rio Preto',
      state: 'SP',
      ownerName: 'Pedro',
      ownerEmail: 'pedro@espetaria.com',
    });
    expect(message.to).toBe(FISCAL_INVOICE_TO);
    expect(message.subject).toBe('After — nota fiscal: Espetaria 017');
    expect(message.text).toContain('Espetaria LTDA');
    expect(message.text).toContain('11.444.777/0001-61');
    expect(message.text).toContain('fiscal@espetaria.com');
    expect(message.text).toContain('R$ 34,90');
    expect(message.text).toContain('PIX');
    expect(message.text).toContain('pur_1');
    expect(message.text).toContain('pedro@espetaria.com');
  });

  it('não envia quando a compra não pediu nota', async () => {
    const prisma = { venue: { findUnique: jest.fn() } };
    const result = await notifyFiscalInvoiceRequest(
      prisma as never,
      purchase({ invoiceRequested: false }),
    );
    expect(result).toEqual({ sent: false, skippedReason: 'not requested' });
    expect(prisma.venue.findUnique).not.toHaveBeenCalled();
    expect(sendResendEmailMock).not.toHaveBeenCalled();
  });

  it('envia para contato@r2ptech.com.br quando a compra pediu nota', async () => {
    const prisma = {
      venue: {
        findUnique: jest.fn().mockResolvedValue({
          name: 'Espetaria 017',
          city: 'São José do Rio Preto',
          state: 'SP',
          owner: { name: 'Pedro', email: 'pedro@espetaria.com' },
        }),
      },
    };
    const result = await notifyFiscalInvoiceRequest(prisma as never, purchase());
    expect(result).toEqual({ sent: true });
    expect(sendResendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'contato@r2ptech.com.br',
        subject: 'After — nota fiscal: Espetaria 017',
      }),
    );
  });
});

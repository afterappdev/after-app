import {
  INestApplication,
  ServiceUnavailableException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { request as httpRequest } from 'http';
import type { AddressInfo } from 'net';
import request from 'supertest';
import { App } from 'supertest/types';
import { CreditsWebhooksController } from './credits-webhooks.controller';
import { CreditsService } from './credits.service';
import { extractMercadoPagoSignatureDataId } from './providers/mercado-pago-orders';

describe('Mercado Pago webhook HTTP', () => {
  let app: INestApplication<App>;
  const credits = { handlePixWebhook: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CreditsWebhooksController],
      providers: [{ provide: CreditsService, useValue: credits }],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    credits.handlePixWebhook.mockReset();
  });

  it('POST /credits/webhooks/mercadopago devolve 200 sem exigir JWT', async () => {
    credits.handlePixWebhook.mockResolvedValue({ received: true });

    await request(app.getHttpServer())
      .post('/credits/webhooks/mercadopago')
      .set('x-signature', 'ts=1,v1=abc')
      .set('x-request-id', 'req-1')
      .send({ type: 'order', data: { id: 'ORD01CARD' } })
      .expect(200)
      .expect({ received: true });

    expect(credits.handlePixWebhook).toHaveBeenCalledWith(
      { type: 'order', data: { id: 'ORD01CARD' } },
      expect.objectContaining({
        xSignature: 'ts=1,v1=abc',
        xRequestId: 'req-1',
      }),
    );
  });

  it('preserva data.id da query e junta x-request-id repetido em uma string', async () => {
    credits.handlePixWebhook.mockResolvedValue({ received: true });

    await request(app.getHttpServer())
      .post('/credits/webhooks/mercadopago')
      .query({ 'data.id': 'ORDTST01M4EJXGH4C0JXW2Z603Y25GBB', type: 'order' })
      .set('x-signature', 'ts=1,v1=abc')
      .set('x-request-id', 'req-a, req-b')
      .send({ type: 'order', id: '123456', data: { id: '123456' } })
      .expect(200);

    const meta = credits.handlePixWebhook.mock.calls[0][1] as {
      xRequestId?: unknown;
      query?: Record<string, unknown>;
    };
    expect(typeof meta.xRequestId).toBe('string');
    expect(meta.xRequestId).toBe('req-a, req-b');
    expect(meta.query).toEqual({
      'data.id': 'ORDTST01M4EJXGH4C0JXW2Z603Y25GBB',
      type: 'order',
    });
    expect(extractMercadoPagoSignatureDataId(meta.query)).toBe(
      'ORDTST01M4EJXGH4C0JXW2Z603Y25GBB',
    );
  });

  it('entrega dois x-request-id como uma única string ao validador', async () => {
    credits.handlePixWebhook.mockResolvedValue({ received: true });
    const address = app.getHttpServer().address() as AddressInfo;

    const body = '{"type":"order","data":{"id":"123456"}}';
    const status = await new Promise<{ code: number; body: string }>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const req = httpRequest(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path: '/credits/webhooks/mercadopago?data.id=ORDTST01M4EJXGH4C0JXW2Z603Y25GBB&type=order',
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body),
            'x-signature': 'ts=1,v1=abc',
          },
        },
        (res) => {
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () =>
            resolve({
              code: res.statusCode ?? 0,
              body: Buffer.concat(chunks).toString('utf8'),
            }),
          );
        },
      );
      req.setHeader('x-request-id', ['req-a', 'req-b']);
      req.on('error', reject);
      req.end(body);
    });

    expect(status.code).toBe(200);
    const meta = credits.handlePixWebhook.mock.calls[0][1] as {
      xRequestId?: unknown;
      headerObservation?: {
        requestCount: number;
        requestEqualsFirst: boolean | null;
        requestEqualsJoin: boolean | null;
        requestCommaInOne: boolean;
        signatureCount: number;
        queryRelation: string;
      };
    };
    expect(meta.xRequestId).toBe('req-a, req-b');
    expect(meta.headerObservation).toEqual(
      expect.objectContaining({
        requestCount: 2,
        requestEqualsFirst: false,
        requestEqualsJoin: true,
        requestCommaInOne: false,
        signatureCount: 1,
        queryRelation: 'same',
      }),
    );
    expect(JSON.stringify(meta.headerObservation)).not.toContain('req-a');
  });

  it('assinatura inválida responde 401 e falha temporária responde 503', async () => {
    credits.handlePixWebhook.mockRejectedValueOnce(
      new UnauthorizedException('Assinatura do webhook inválida'),
    );
    await request(app.getHttpServer())
      .post('/credits/webhooks/mercadopago')
      .send({ type: 'order', data: { id: 'ORD01CARD' } })
      .expect(401);

    credits.handlePixWebhook.mockRejectedValueOnce(
      new ServiceUnavailableException('Não foi possível confirmar o pagamento PIX.'),
    );
    await request(app.getHttpServer())
      .post('/credits/webhooks/pix')
      .send({ type: 'order', data: { id: 'ORD01CARD' } })
      .expect(503);
  });
});

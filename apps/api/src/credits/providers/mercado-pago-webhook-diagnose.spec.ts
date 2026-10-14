import { createHmac } from 'crypto';
import { verifyMercadoPagoWebhookSignature } from './mercado-pago-orders';
import {
  diagnoseMercadoPagoWebhookHmac,
  documentedManifest,
  formatMercadoPagoHmacDiagnosis,
  formatMercadoPagoRawHeaderObservation,
  hmacSha256,
  observeMercadoPagoRawHeaders,
} from './mercado-pago-webhook-diagnose';

describe('diagnóstico independente do HMAC Mercado Pago', () => {
  const secret = 'whsec_independent';
  const dataId = 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3';
  const requestId = '2066ca19-c6f1-498a-be75-1923005edd06';
  const ts = '1742505638683';
  const manifest =
    'id:ORD01JQ4S4KY8HWQ6NA5PXB65B3D3;request-id:2066ca19-c6f1-498a-be75-1923005edd06;ts:1742505638683;';

  function signature(message: string, key = secret): string {
    return `ts=${ts},v1=${createHmac('sha256', key).update(message).digest('hex')}`;
  }

  it('reproduz o manifesto literal da documentação sem usar o validador de produção', () => {
    expect(documentedManifest(dataId, requestId, ts)).toBe(manifest);
    expect(hmacSha256(secret, manifest)).toBe(
      createHmac('sha256', secret).update(manifest).digest('hex'),
    );
    expect(documentedManifest('', '', ts)).toBe(`ts:${ts};`);
    expect(documentedManifest(dataId, '', ts)).toBe(`id:${dataId};ts:${ts};`);
  });

  it('aceita a caixa original e recusa segredo, v1 ilustrativo e manifesto em minúsculas', () => {
    const diagnosis = diagnoseMercadoPagoWebhookHmac({
      secret,
      dataId,
      xRequestId: ` ${requestId} `,
      xSignature: signature(manifest),
    });
    expect(diagnosis.official).toBe(true);
    expect(diagnosis.lowerId).toBe(false);
    expect(diagnosis.requestHeader).toBe('string');
    expect(diagnosis.v1Hex).toBe(true);

    const illustrated =
      'ced36ab6d33566bb1e16c125819b8d840d6b8ef136b0b9127c76064466f5229b';
    expect(
      diagnoseMercadoPagoWebhookHmac({
        secret,
        dataId,
        xRequestId: requestId,
        xSignature: `ts=${ts},v1=${illustrated}`,
      }).official,
    ).toBe(false);
    expect(
      diagnoseMercadoPagoWebhookHmac({
        secret: 'whsec_other',
        dataId,
        xRequestId: requestId,
        xSignature: signature(manifest),
      }).official,
    ).toBe(false);
    expect(
      verifyMercadoPagoWebhookSignature({
        secret,
        dataId,
        xRequestId: requestId,
        xSignature: signature(manifest),
      }),
    ).toBe(true);
  });

  it('identifica header repetido e campo opcional sem aceitar outra variante', () => {
    const upperId = 'ORDTST01M4EJXGH4C0JXW2Z603Y25GBB';
    const joined = diagnoseMercadoPagoWebhookHmac({
      secret,
      dataId: upperId,
      xRequestId: ['req-a', 'req-b'],
      xSignature: signature(documentedManifest(upperId, 'req-a', ts)),
    });
    expect(joined.requestHeader).toBe('array');
    expect(joined.requestParts).toBe(1);
    expect(joined.firstSegment).toBe('single');
    expect(joined.official).toBe(true);

    const expressJoined = diagnoseMercadoPagoWebhookHmac({
      secret,
      dataId: upperId,
      xRequestId: 'req-a, req-b',
      xSignature: signature(documentedManifest(upperId, 'req-a', ts)),
    });
    expect(expressJoined.official).toBe(false);
    expect(expressJoined.firstSegment).toBe('matches');
    expect(expressJoined.requestParts).toBe(2);

    const omitted = diagnoseMercadoPagoWebhookHmac({
      secret,
      dataId: upperId,
      xRequestId: 'req-extra',
      xSignature: signature(documentedManifest(upperId, '', ts)),
    });
    expect(omitted.official).toBe(false);
    expect(omitted.omitRequest).toBe('matches');

    const line = formatMercadoPagoHmacDiagnosis(expressJoined);
    expect(line).not.toContain(secret);
    expect(line).not.toContain(upperId);
    expect(line).not.toContain('req-a');
    expect(line).not.toContain(signature(documentedManifest(upperId, 'req-a', ts)));
  });

  it('compara rawHeaders com o header já juntado sem revelar os valores', () => {
    const observed = observeMercadoPagoRawHeaders({
      rawHeaders: [
        'Host',
        'localhost',
        'X-Request-Id',
        'req-a',
        'x-request-id',
        'req-b',
        'x-signature',
        'ts=1,v1=abc',
      ],
      xSignature: 'ts=1,v1=abc',
      xRequestId: 'req-a, req-b',
      rawUrl: '/credits/webhooks/mercadopago?data.id=ORDABC&type=order',
      parsedDataId: 'ORDABC',
    });
    expect(observed).toEqual({
      signatureCount: 1,
      requestCount: 2,
      signatureName: 'lower',
      requestName: 'mixed',
      signatureEqualsFirst: true,
      signatureEqualsJoin: true,
      requestEqualsFirst: false,
      requestEqualsJoin: true,
      signatureCommaInOne: true,
      requestCommaInOne: false,
      queryRelation: 'same',
      queryEncoded: false,
    });

    const folded = observeMercadoPagoRawHeaders({
      rawHeaders: ['x-request-id', 'req-a'],
      xRequestId: 'req-a',
      rawUrl: '/credits/webhooks/mercadopago?data.id=ord%41bc',
      parsedDataId: 'ORDABC',
    });
    expect(folded.queryRelation).toBe('case');
    expect(folded.queryEncoded).toBe(true);
    expect(folded.requestCount).toBe(1);
    expect(folded.requestEqualsFirst).toBe(true);

    const line = formatMercadoPagoRawHeaderObservation(observed);
    expect(line).toContain('requestCount=2');
    expect(line).toContain('requestEqualsJoin=true');
    expect(line).not.toContain('req-a');
    expect(line).not.toContain('ORDABC');
    expect(line).not.toContain('v1=abc');
  });
});

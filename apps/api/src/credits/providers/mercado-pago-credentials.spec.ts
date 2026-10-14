import { ServiceUnavailableException } from '@nestjs/common';
import {
  assertMercadoPagoCardChargeAllowed,
  assertMercadoPagoPixChargeAllowed,
  mercadoPagoAccessTokenKind,
  mercadoPagoPublicKeyKind,
} from './mercado-pago-credentials';

describe('credenciais do Mercado Pago', () => {
  const originalToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  const originalPublic = process.env.MERCADO_PAGO_PUBLIC_KEY;
  const originalSandbox = process.env.MERCADO_PAGO_SANDBOX;
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    if (originalToken === undefined) delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
    else process.env.MERCADO_PAGO_ACCESS_TOKEN = originalToken;
    if (originalPublic === undefined) delete process.env.MERCADO_PAGO_PUBLIC_KEY;
    else process.env.MERCADO_PAGO_PUBLIC_KEY = originalPublic;
    if (originalSandbox === undefined) delete process.env.MERCADO_PAGO_SANDBOX;
    else process.env.MERCADO_PAGO_SANDBOX = originalSandbox;
  });

  it('separa Access Token e Public Key', () => {
    expect(mercadoPagoAccessTokenKind('TEST-access')).toBe('test');
    expect(mercadoPagoAccessTokenKind('APP_USR-access')).toBe('shared');
    expect(mercadoPagoPublicKeyKind('TEST-public')).toBe('test');
    expect(mercadoPagoPublicKeyKind('APP_USR-public')).toBe('shared');
    expect(mercadoPagoAccessTokenKind('')).toBe('unknown');
    expect(mercadoPagoPublicKeyKind(undefined)).toBe('unknown');
  });

  it('aceita credenciais de teste APP_USR e o par legado TEST-', () => {
    process.env.NODE_ENV = 'test';
    process.env.MERCADO_PAGO_SANDBOX = 'true';
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'APP_USR-access';
    process.env.MERCADO_PAGO_PUBLIC_KEY = 'APP_USR-public';
    expect(() => assertMercadoPagoPixChargeAllowed()).not.toThrow();
    expect(() => assertMercadoPagoCardChargeAllowed()).not.toThrow();

    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'TEST-access';
    process.env.MERCADO_PAGO_PUBLIC_KEY = 'APP_USR-public';
    expect(() => assertMercadoPagoPixChargeAllowed()).not.toThrow();
    expect(() => assertMercadoPagoCardChargeAllowed()).not.toThrow();

    process.env.MERCADO_PAGO_PUBLIC_KEY = 'TEST-public';
    expect(() => assertMercadoPagoCardChargeAllowed()).not.toThrow();
  });

  it('aceita produção com APP_USR e sandbox desligado', () => {
    process.env.NODE_ENV = 'production';
    process.env.MERCADO_PAGO_SANDBOX = 'false';
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'APP_USR-access';
    process.env.MERCADO_PAGO_PUBLIC_KEY = 'APP_USR-public';
    expect(() => assertMercadoPagoPixChargeAllowed()).not.toThrow();
    expect(() => assertMercadoPagoCardChargeAllowed()).not.toThrow();
  });

  it('recusa Sandbox e credencial TEST- em produção', () => {
    process.env.NODE_ENV = 'production';
    process.env.MERCADO_PAGO_SANDBOX = 'true';
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'APP_USR-access';
    process.env.MERCADO_PAGO_PUBLIC_KEY = 'APP_USR-public';
    expect(() => assertMercadoPagoPixChargeAllowed()).toThrow(
      ServiceUnavailableException,
    );
    expect(() => assertMercadoPagoCardChargeAllowed()).toThrow(
      ServiceUnavailableException,
    );

    process.env.MERCADO_PAGO_SANDBOX = 'false';
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'TEST-access';
    process.env.MERCADO_PAGO_PUBLIC_KEY = 'TEST-public';
    expect(() => assertMercadoPagoPixChargeAllowed()).toThrow(
      ServiceUnavailableException,
    );
    expect(() => assertMercadoPagoCardChargeAllowed()).toThrow(
      ServiceUnavailableException,
    );

    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'APP_USR-access';
    expect(() => assertMercadoPagoPixChargeAllowed()).not.toThrow();
    expect(() => assertMercadoPagoCardChargeAllowed()).toThrow(
      ServiceUnavailableException,
    );
  });
});

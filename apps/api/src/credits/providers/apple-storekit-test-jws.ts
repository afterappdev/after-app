type KeyPair = { prvKeyObj: unknown; pubKeyObj: unknown };

type Jsrsasign = {
  KJUR: {
    asn1: {
      x509: {
        Certificate: new (options: Record<string, unknown>) => {
          getPEM(): string;
        };
      };
    };
    jws: {
      JWS: {
        sign: (
          alg: null,
          header: Record<string, unknown>,
          payload: Record<string, unknown>,
          key: string,
        ) => string;
      };
    };
  };
  KEYUTIL: {
    generateKeypair: (alg: string, curve: string) => KeyPair;
    getPEM: (key: unknown, format?: string) => string;
  };
  X509: new () => { readCertPEM(pem: string): void; hex: string };
};

const { KJUR, KEYUTIL, X509 } = require('jsrsasign') as Jsrsasign;

export type TestAppleChain = {
  rootDer: Buffer;
  sign: (overrides?: Record<string, unknown>) => string;
};

function pemPrivate(key: KeyPair): string {
  return KEYUTIL.getPEM(key.prvKeyObj, 'PKCS8PRV');
}

function pemPublic(key: KeyPair): string {
  return KEYUTIL.getPEM(key.pubKeyObj);
}

function certificate(options: Record<string, unknown>): string {
  return new KJUR.asn1.x509.Certificate(options).getPEM();
}

function derBase64(pem: string): string {
  const parsed = new X509();
  parsed.readCertPEM(pem);
  return Buffer.from(parsed.hex, 'hex').toString('base64');
}

export function createTestAppleChain(): TestAppleChain {
  const root = KEYUTIL.generateKeypair('EC', 'P-256');
  const intermediate = KEYUTIL.generateKeypair('EC', 'P-256');
  const leaf = KEYUTIL.generateKeypair('EC', 'P-256');
  const validity = {
    notbefore: '200101000000Z',
    notafter: '400101000000Z',
    sigalg: 'SHA256withECDSA',
  };
  const rootPem = certificate({
    version: 3,
    serial: { int: 1 },
    issuer: { str: '/CN=Test Apple Root' },
    subject: { str: '/CN=Test Apple Root' },
    sbjpubkey: pemPublic(root),
    ext: [
      { extname: 'basicConstraints', cA: true, critical: true },
      { extname: 'keyUsage', names: ['keyCertSign', 'cRLSign'], critical: true },
    ],
    cakey: pemPrivate(root),
    ...validity,
  });
  const intermediatePem = certificate({
    version: 3,
    serial: { int: 2 },
    issuer: { str: '/CN=Test Apple Root' },
    subject: { str: '/CN=Test Apple Intermediate' },
    sbjpubkey: pemPublic(intermediate),
    ext: [
      { extname: 'basicConstraints', cA: true, critical: true },
      { extname: 'keyUsage', names: ['keyCertSign', 'cRLSign'], critical: true },
      { extname: '1.2.840.113635.100.6.2.1', extn: '3000' },
    ],
    cakey: pemPrivate(root),
    ...validity,
  });
  const leafPem = certificate({
    version: 3,
    serial: { int: 3 },
    issuer: { str: '/CN=Test Apple Intermediate' },
    subject: { str: '/CN=Test Apple Leaf' },
    sbjpubkey: pemPublic(leaf),
    ext: [
      { extname: 'basicConstraints', cA: false },
      { extname: 'keyUsage', names: ['digitalSignature'], critical: true },
      { extname: '1.2.840.113635.100.6.11.1', extn: '3000' },
    ],
    cakey: pemPrivate(intermediate),
    ...validity,
  });
  const x5c = [
    derBase64(leafPem),
    derBase64(intermediatePem),
    derBase64(rootPem),
  ];
  const leafKey = pemPrivate(leaf);
  return {
    rootDer: Buffer.from(x5c[2], 'base64'),
    sign(overrides: Record<string, unknown> = {}) {
      const now = 1_700_000_000_000;
      return KJUR.jws.JWS.sign(
        null,
        { alg: 'ES256', x5c },
        {
          transactionId: '2000000123',
          originalTransactionId: '2000000123',
          bundleId: 'com.r2p.after.afterApp',
          productId: 'after.credits.1',
          purchaseDate: now,
          originalPurchaseDate: now,
          quantity: 1,
          type: 'Consumable',
          inAppOwnershipType: 'PURCHASED',
          signedDate: now,
          environment: 'Sandbox',
          transactionReason: 'PURCHASE',
          storefront: 'BRA',
          storefrontId: '143503',
          price: 34900,
          currency: 'BRL',
          ...overrides,
        },
        leafKey,
      );
    },
  };
}

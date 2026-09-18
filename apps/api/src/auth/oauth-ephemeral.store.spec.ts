import {
  APPLE_WEB_EXCHANGE_TTL_MS,
  APPLE_WEB_STATE_TTL_MS,
  OAuthEphemeralStore,
} from './oauth-ephemeral.store';

describe('OAuthEphemeralStore', () => {
  let now: number;
  let store: OAuthEphemeralStore;

  beforeEach(() => {
    now = 1_000_000;
    store = new OAuthEphemeralStore(() => now);
  });

  it('aceita state válido uma vez', () => {
    store.putSession('state-1', {
      nonce: 'nonce-1',
      redirect: 'https://app-after.com.br/',
    });
    expect(store.consumeSession('state-1')).toEqual(
      expect.objectContaining({ nonce: 'nonce-1' }),
    );
    expect(store.consumeSession('state-1')).toBeNull();
  });

  it('rejeita state desconhecido', () => {
    expect(store.consumeSession('missing')).toBeNull();
  });

  it('rejeita state expirado', () => {
    store.putSession(
      'state-1',
      { nonce: 'nonce-1', redirect: 'https://app-after.com.br/' },
      APPLE_WEB_STATE_TTL_MS,
    );
    now += APPLE_WEB_STATE_TTL_MS + 1;
    expect(store.consumeSession('state-1')).toBeNull();
  });

  it('login exchange code é single-use e expira', () => {
    store.putExchange('code-1', { accessToken: 'session-jwt' });
    expect(store.consumeExchange('code-1')).toEqual({
      accessToken: 'session-jwt',
    });
    expect(store.consumeExchange('code-1')).toBeNull();

    store.putExchange(
      'code-2',
      { accessToken: 'session-jwt' },
      APPLE_WEB_EXCHANGE_TTL_MS,
    );
    now += APPLE_WEB_EXCHANGE_TTL_MS + 1;
    expect(store.consumeExchange('code-2')).toBeNull();
  });
});

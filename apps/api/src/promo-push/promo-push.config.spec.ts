import {
  promoPushLocationMaxAgeMs,
  promoPushMaxPerUserPerDay,
  resolvePromoPushMode,
} from './promo-push.config';

describe('promo push config', () => {
  it('sem configuração válida permanece desligado', () => {
    expect(resolvePromoPushMode({})).toEqual({ kind: 'off' });
    expect(resolvePromoPushMode({ PROMO_PUSH_ENABLED: '' })).toEqual({
      kind: 'off',
    });
    expect(resolvePromoPushMode({ PROMO_PUSH_ENABLED: 'TRUE' })).toEqual({
      kind: 'off',
    });
    expect(resolvePromoPushMode({ PROMO_PUSH_ENABLED: '1' })).toEqual({
      kind: 'off',
    });
    expect(resolvePromoPushMode({ PROMO_PUSH_ENABLED: 'yes' })).toEqual({
      kind: 'off',
    });
  });

  it('true com allowlist vazia é o único modo público', () => {
    expect(
      resolvePromoPushMode({
        PROMO_PUSH_ENABLED: ' true ',
        PROMO_PUSH_ALLOWLIST_USER_IDS: '  ',
      }),
    ).toEqual({ kind: 'public' });
  });

  it('allowlist restringe mesmo quando a flag está true', () => {
    expect(
      resolvePromoPushMode({
        PROMO_PUSH_ENABLED: 'true',
        PROMO_PUSH_ALLOWLIST_USER_IDS: 'user-a, user-a, user-b',
      }),
    ).toEqual({ kind: 'allowlist', userIds: ['user-a', 'user-b'] });
  });

  it('allowlist com a flag desligada continua restrita e não vira público', () => {
    expect(
      resolvePromoPushMode({
        PROMO_PUSH_ENABLED: 'false',
        PROMO_PUSH_ALLOWLIST_USER_IDS: '*',
      }),
    ).toEqual({ kind: 'allowlist', userIds: ['*'] });
  });

  it('limite ausente é 5 e limite inválido não envia', () => {
    expect(promoPushMaxPerUserPerDay({})).toBe(5);
    expect(promoPushMaxPerUserPerDay({ PROMO_PUSH_MAX_PER_USER_PER_DAY: '5' })).toBe(
      5,
    );
    expect(promoPushMaxPerUserPerDay({ PROMO_PUSH_MAX_PER_USER_PER_DAY: '0' })).toBe(
      0,
    );
    expect(
      promoPushMaxPerUserPerDay({ PROMO_PUSH_MAX_PER_USER_PER_DAY: 'nope' }),
    ).toBe(0);
    expect(
      promoPushMaxPerUserPerDay({ PROMO_PUSH_MAX_PER_USER_PER_DAY: '1000' }),
    ).toBe(0);
  });

  it('idade ausente é 6 horas e idade inválida torna a cidade detectada vencida', () => {
    expect(promoPushLocationMaxAgeMs({})).toBe(6 * 60 * 60 * 1000);
    expect(
      promoPushLocationMaxAgeMs({ PROMO_PUSH_LOCATION_MAX_AGE_HOURS: '6' }),
    ).toBe(6 * 60 * 60 * 1000);
    expect(
      promoPushLocationMaxAgeMs({ PROMO_PUSH_LOCATION_MAX_AGE_HOURS: '-1' }),
    ).toBe(0);
  });
});

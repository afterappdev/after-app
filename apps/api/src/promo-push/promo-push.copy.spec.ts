import {
  PROMO_PUSH_BODY_FALLBACK,
  PROMO_PUSH_FCM_BODY_MAX,
  fcmCollapseKey,
  promoPushBody,
  promoPushCopy,
  promoPushTitle,
} from './promo-push.copy';

describe('promo push copy', () => {
  it('monta título com nome do estabelecimento e título real do banner', () => {
    const copy = promoPushCopy(
      'Refúgio do Chef',
      'PROMOTION',
      'Sextou com Promoção!',
      'Hoje tem porção de batata com cheddar e bacon por R$ 29,90. Aproveite até as 23h!',
    );
    expect(copy.title).toBe('Refúgio do Chef publicou Sextou com Promoção!');
    expect(copy.body).toBe(
      'Hoje tem porção de batata com cheddar e bacon por R$ 29,90. Aproveite até as 23h!',
    );
  });

  it('preserva acentos e emojis no título e no corpo', () => {
    const copy = promoPushCopy(
      'Bar Central',
      null,
      'Chopp 🍺 em dobro',
      'Só hoje — até 22h 🎉',
    );
    expect(copy.title).toBe('Bar Central publicou Chopp 🍺 em dobro');
    expect(copy.body).toBe('Só hoje — até 22h 🎉');
  });

  it('usa título genérico por tipo quando o banner não tem título', () => {
    expect(promoPushTitle('Bar Central', null, null)).toBe(
      'Bar Central publicou uma novidade para hoje!',
    );
    expect(promoPushTitle('Bar Central', 'PROMOTION', '')).toBe(
      'Bar Central publicou uma promoção para hoje!',
    );
    expect(promoPushTitle('Bar Central', 'EVENT', '   ')).toBe(
      'Bar Central publicou um evento para hoje!',
    );
  });

  it('usa a descrição do banner no corpo quando existir', () => {
    const copy = promoPushCopy(
      'Bar Central',
      'PROMOTION',
      'Happy hour',
      'Chopp em dobro 🍺\nAté 22h',
    );
    expect(copy.title).toBe('Bar Central publicou Happy hour');
    expect(copy.body).toBe('Chopp em dobro 🍺\nAté 22h');
  });

  it('usa fallback quando descrição vazia ou só espaços', () => {
    expect(promoPushCopy('Bar', null, 'Título', null).body).toBe(
      PROMO_PUSH_BODY_FALLBACK,
    );
    expect(promoPushCopy('Bar', null, 'Título', '').body).toBe(
      PROMO_PUSH_BODY_FALLBACK,
    );
    expect(promoPushCopy('Bar', null, 'Título', '   ').body).toBe(
      PROMO_PUSH_BODY_FALLBACK,
    );
  });

  it('limita corpo extremamente longo para caber no FCM', () => {
    const long = 'a'.repeat(PROMO_PUSH_FCM_BODY_MAX + 50);
    const body = promoPushBody(long);
    expect(body.length).toBe(PROMO_PUSH_FCM_BODY_MAX);
    expect(body.endsWith('…')).toBe(true);
  });

  it('a chave de colapso é estável e curta', () => {
    expect(fcmCollapseKey('evt_123')).toBe('evt_123');
    expect(fcmCollapseKey('x'.repeat(40))).toHaveLength(32);
  });
});

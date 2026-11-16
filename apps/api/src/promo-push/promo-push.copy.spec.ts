import {
  PROMO_PUSH_BODY_FALLBACK,
  PROMO_PUSH_FCM_BODY_MAX,
  fcmCollapseKey,
  promoPushBody,
  promoPushCopy,
  promoPushTitle,
} from './promo-push.copy';
import {
  PROMO_PUBLICATION_DESCRIPTION_MAX,
  PROMO_PUBLICATION_TITLE_MAX,
} from './promo-push.limits';

describe('promo push copy', () => {
  it('usa título e descrição do banner no aviso', () => {
    const copy = promoPushCopy(
      'Refúgio do Chef',
      'PROMOTION',
      'Sextou com Promoção!',
      'Hoje tem porção especial por R$ 29,90.',
    );
    expect(copy.title).toBe('Sextou com Promoção!');
    expect(copy.body).toBe('Hoje tem porção especial por R$ 29,90.');
  });

  it('preserva acentos e emojis', () => {
    const copy = promoPushCopy(
      'Bar Central',
      null,
      'Chopp 🍺 em dobro',
      'Só hoje — até 22h 🎉',
    );
    expect(copy.title).toBe('Chopp 🍺 em dobro');
    expect(copy.body).toBe('Só hoje — até 22h 🎉');
  });

  it('usa fallback curto quando o banner não tem título', () => {
    expect(promoPushTitle(null, null)).toBe('Novidade do dia');
    expect(promoPushTitle('PROMOTION', '')).toBe('Promoção do dia');
    expect(promoPushTitle('EVENT', '   ')).toBe('Evento do dia');
  });

  it('usa a descrição do banner no corpo quando existir', () => {
    const copy = promoPushCopy(
      'Bar Central',
      'PROMOTION',
      'Happy hour',
      'Chopp em dobro até 22h',
    );
    expect(copy.title).toBe('Happy hour');
    expect(copy.body).toBe('Chopp em dobro até 22h');
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

  it('corta título e corpo acima do limite de publicação', () => {
    const title = 't'.repeat(PROMO_PUBLICATION_TITLE_MAX + 5);
    const body = 'b'.repeat(PROMO_PUBLICATION_DESCRIPTION_MAX + 5);
    const copy = promoPushCopy('Bar', 'PROMOTION', title, body);
    expect(copy.title.length).toBe(PROMO_PUBLICATION_TITLE_MAX);
    expect(copy.body.length).toBe(PROMO_PUBLICATION_DESCRIPTION_MAX);
  });

  it('limita corpo extremamente longo para caber no FCM', () => {
    const long = 'a'.repeat(PROMO_PUSH_FCM_BODY_MAX + 50);
    const body = promoPushBody(long);
    expect(body.length).toBe(PROMO_PUBLICATION_DESCRIPTION_MAX);
  });

  it('a chave de colapso é estável e curta', () => {
    expect(fcmCollapseKey('evt_123')).toBe('evt_123');
    expect(fcmCollapseKey('x'.repeat(40))).toHaveLength(32);
  });
});
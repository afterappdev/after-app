import { fcmCollapseKey, promoPushCopy } from './promo-push.copy';

describe('promo push copy', () => {
  it('não chama de promoção um tipo ausente, mesmo com desconto no título', () => {
    const copy = promoPushCopy('Bar Central', null);
    expect(copy.title).toBe('Bar Central publicou uma novidade para hoje!');
    expect(copy.title.toLowerCase()).not.toContain('promoção');
    expect(copy.title.toLowerCase()).not.toContain('evento');
    expect(copy.body).toContain('Toque para ver');
  });

  it('usa promoção ou evento só quando o tipo foi gravado', () => {
    expect(promoPushCopy('Bar Central', 'PROMOTION').title).toBe(
      'Bar Central publicou uma promoção para hoje!',
    );
    expect(promoPushCopy('Bar Central', 'EVENT').title).toBe(
      'Bar Central publicou um evento para hoje!',
    );
  });

  it('a chave de colapso é estável e curta', () => {
    expect(fcmCollapseKey('evt_123')).toBe('evt_123');
    expect(fcmCollapseKey('x'.repeat(40))).toHaveLength(32);
  });
});

import { buildFcmMulticast } from './firebase-messaging.port';

describe('buildFcmMulticast', () => {
  it('mantém o corpo administrativo quando não há colapso nem canal', () => {
    expect(
      buildFcmMulticast(['admin-token'], {
        title: 'Venda',
        body: 'Créditos',
        data: { type: 'PURCHASE_PAID', entityId: 'sale-1' },
      }),
    ).toEqual({
      tokens: ['admin-token'],
      notification: { title: 'Venda', body: 'Créditos' },
      data: { type: 'PURCHASE_PAID', entityId: 'sale-1' },
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } },
    });
  });

  it('acrescenta colapso e canal só no push promocional', () => {
    const message = buildFcmMulticast(['consumer-token'], {
      title: 'Novidade',
      body: 'Toque',
      collapseKey: 'evt-1',
      androidChannelId: 'promo_alerts',
      data: { type: 'PROMO_PUBLISHED', eventId: 'evt-1' },
    });
    expect(message.android.collapseKey).toBe('evt-1');
    expect(message.android.notification).toEqual({ channelId: 'promo_alerts' });
    expect(message.apns.headers).toEqual({ 'apns-collapse-id': 'evt-1' });
    expect(message.webpush?.headers.Topic).toBe('evt-1');
  });

  it('inclui imagem HTTPS no notification e no android quando informada', () => {
    const image = 'https://media.app-after.com.br/uploads/logo.jpg';
    const message = buildFcmMulticast(['consumer-token'], {
      title: 'Bar publicou "Promo"',
      body: 'Toque',
      collapseKey: 'evt-1',
      androidChannelId: 'promo_alerts',
      imageUrl: image,
      data: { type: 'PROMO_PUBLISHED', imageUrl: image },
    });
    expect(message.notification.imageUrl).toBe(image);
    expect(message.android.notification).toEqual({
      channelId: 'promo_alerts',
      imageUrl: image,
    });
  });
});

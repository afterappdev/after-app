import { resolveVipPushLogoUrl } from './promo-push-image';

describe('resolveVipPushLogoUrl', () => {
  it('aceita HTTPS com extensão de imagem', () => {
    expect(
      resolveVipPushLogoUrl(
        'https://media.app-after.com.br/uploads/logo-new.jpg',
      ),
    ).toBe('https://media.app-after.com.br/uploads/logo-new.jpg');
  });

  it('aceita caminho /uploads/ sem extensão conhecida', () => {
    expect(
      resolveVipPushLogoUrl('https://media.app-after.com.br/uploads/abc123'),
    ).toBe('https://media.app-after.com.br/uploads/abc123');
  });

  it('rejeita HTTP, vazio e URLs longas demais', () => {
    expect(resolveVipPushLogoUrl('http://media/logo.jpg')).toBeUndefined();
    expect(resolveVipPushLogoUrl('')).toBeUndefined();
    expect(resolveVipPushLogoUrl('https://x/y.pdf')).toBeUndefined();
    expect(
      resolveVipPushLogoUrl(`https://media.app-after.com.br/${'a'.repeat(3000)}`),
    ).toBeUndefined();
  });
});

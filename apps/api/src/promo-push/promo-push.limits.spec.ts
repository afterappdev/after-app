import { assertBannerCopyForPush } from './promo-push.limits';

describe('promo push publication limits', () => {
  it('aceita título e descrição dentro do limite', () => {
    expect(() =>
      assertBannerCopyForPush('Chopp em dobro', 'Até 22h no salão'),
    ).not.toThrow();
  });

  it('aceita título com exatamente 20 caracteres', () => {
    expect(() => assertBannerCopyForPush('x'.repeat(20), 'ok')).not.toThrow();
  });

  it('rejeita título com 21 caracteres', () => {
    expect(() => assertBannerCopyForPush('x'.repeat(21), 'ok')).toThrow(
      /20 caracteres/,
    );
  });

  it('rejeita descrição longa', () => {
    expect(() =>
      assertBannerCopyForPush('ok', 'y'.repeat(61)),
    ).toThrow(/60 caracteres/);
  });
});
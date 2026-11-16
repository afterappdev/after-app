import { assertBannerCopyForPush } from './promo-push.limits';

describe('promo push publication limits', () => {
  it('aceita título e descrição dentro do limite', () => {
    expect(() =>
      assertBannerCopyForPush('Chopp em dobro', 'Até 22h no salão'),
    ).not.toThrow();
  });

  it('rejeita título longo', () => {
    expect(() =>
      assertBannerCopyForPush('x'.repeat(31), 'ok'),
    ).toThrow(/30 caracteres/);
  });

  it('rejeita descrição longa', () => {
    expect(() =>
      assertBannerCopyForPush('ok', 'y'.repeat(61)),
    ).toThrow(/60 caracteres/);
  });
});
import { civilDateUtc, civilDayWindow } from './promo-push.window';

describe('civil day in America/Sao_Paulo', () => {
  it('vira o dia às 00:00 de São Paulo', () => {
    expect(civilDateUtc(new Date('2026-10-07T02:30:00.000Z'))).toEqual(
      new Date(Date.UTC(2026, 9, 6)),
    );
    expect(civilDateUtc(new Date('2026-10-07T03:00:00.000Z'))).toEqual(
      new Date(Date.UTC(2026, 9, 7)),
    );
  });

  it('abre a janela no início do dia civil e fecha no início do seguinte', () => {
    const window = civilDayWindow(new Date(Date.UTC(2026, 9, 20)));
    expect(window.availableAt.toISOString()).toBe('2026-10-20T03:00:00.000Z');
    expect(window.expiresAt.toISOString()).toBe('2026-10-21T03:00:00.000Z');
  });
});

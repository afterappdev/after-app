import { AccountLifecycleStatus } from '@prisma/client';
import { AudienceCandidate, promoAudienceWhere, selectPromoAudience } from './promo-push.audience';

const now = new Date('2026-10-20T15:00:00.000Z');
const sixHours = 6 * 60 * 60 * 1000;

function candidate(
  overrides: Partial<AudienceCandidate> = {},
): AudienceCandidate {
  return {
    id: 'user-1',
    role: 'USER',
    promoNotificationsEnabled: true,
    ibgeCityId: 3550308,
    lastAuthorizedIbgeCityId: null,
    lastAuthorizedCityAt: null,
    blocked: false,
    tokens: [{ id: 'tok-1', token: 'token-user-1', disabledAt: null }],
    ...overrides,
  };
}

function select(
  candidates: AudienceCandidate[],
  counts = new Map<string, number>(),
  maxPerDay = 5,
) {
  return selectPromoAudience({
    candidates,
    ibgeCityId: 3550308,
    now,
    locationMaxAgeMs: sixHours,
    maxPerDay,
    recentEventCounts: counts,
  });
}

describe('selectPromoAudience', () => {
  it('inclui a cidade cadastrada', () => {
    const result = select([candidate()]);
    expect(result.selected.map((item) => item.id)).toEqual(['user-1']);
  });

  it('inclui a cidade detectada dentro de 6 horas e deduplica quem casa pelos dois critérios', () => {
    const both = candidate({
      id: 'both',
      lastAuthorizedIbgeCityId: 3550308,
      lastAuthorizedCityAt: new Date(now.getTime() - 60_000),
    });
    const detectedOnly = candidate({
      id: 'detected',
      ibgeCityId: 3304557,
      lastAuthorizedIbgeCityId: 3550308,
      lastAuthorizedCityAt: new Date(now.getTime() - sixHours),
    });
    const result = select([both, both, detectedOnly]);
    expect(result.selected.map((item) => item.id)).toEqual(['both', 'detected']);
  });

  it('ignora cidade detectada vencida e mantém a cadastrada', () => {
    const expired = candidate({
      id: 'expired',
      ibgeCityId: 3304557,
      lastAuthorizedIbgeCityId: 3550308,
      lastAuthorizedCityAt: new Date(now.getTime() - sixHours - 1),
    });
    const registered = candidate({
      id: 'registered',
      lastAuthorizedIbgeCityId: 3550308,
      lastAuthorizedCityAt: new Date(now.getTime() - sixHours - 1),
    });
    const result = select([expired, registered]);
    expect(result.selected.map((item) => item.id)).toEqual(['registered']);
  });

  it('não trata homônimo de outro estado como a mesma cidade', () => {
    const result = select([
      candidate({ id: 'other-state', ibgeCityId: 2201903 }),
    ]);
    expect(result.selected).toEqual([]);
  });

  it('exclui opt-out, bloqueio, estabelecimento e quem já recebeu 5', () => {
    const counts = new Map<string, number>([['capped', 5]]);
    const result = select(
      [
        candidate({ id: 'opt-out', promoNotificationsEnabled: false }),
        candidate({ id: 'blocked', blocked: true }),
        candidate({ id: 'venue', role: 'VENUE' }),
        candidate({ id: 'capped' }),
        candidate({ id: 'under', ibgeCityId: 3550308 }),
      ],
      counts,
    );
    expect(result.selected.map((item) => item.id)).toEqual(['under']);
    expect(result.skippedByCap).toEqual(['capped']);
  });

  it('quatro notificações ainda permitem a quinta', () => {
    const result = select(
      [candidate({ id: 'four' })],
      new Map([['four', 4]]),
    );
    expect(result.selected).toHaveLength(1);
  });

  it('limite inválido zero não seleciona ninguém', () => {
    expect(select([candidate()], new Map(), 0).selected).toEqual([]);
  });
});

describe('promoAudienceWhere', () => {
  it('filtra por IBGE, opt-in, papel e bloqueio, sem comparar o nome da cidade', () => {
    const where = promoAudienceWhere({
      ibgeCityId: 3550308,
      freshAfter: new Date('2026-10-20T09:00:00.000Z'),
      venueId: 'venue-1',
      allowlist: ['user-a'],
    });
    expect(where.role).toBe('USER');
    expect(where.accountStatus).toBe(AccountLifecycleStatus.ACTIVE);
    expect(where.promoNotificationsEnabled).toBe(true);
    expect(where.venueBlocks).toEqual({ none: { venueId: 'venue-1' } });
    expect(where.id).toEqual({ in: ['user-a'] });
    expect(JSON.stringify(where)).not.toContain('"city"');
    expect(JSON.stringify(where)).not.toContain('Bom Jesus');
  });
});

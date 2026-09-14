import { computeIsOpen } from './hours';

/** September 2026 is UTC−3 (no DST). Monday 2026-09-14, Friday 2026-09-18. */
function utc(iso: string): Date {
  return new Date(iso);
}

const MON_HOURS = {
  mon: { open: '10:00', close: '23:00' },
};

const OVERNIGHT = {
  fri: { open: '20:00', close: '02:00' },
  sat: { open: '12:00', close: '22:00' },
};

describe('computeIsOpen America/Sao_Paulo', () => {
  describe('horário normal segunda 10:00–23:00', () => {
    it('segunda 06:59 SP → fechado', () => {
      expect(computeIsOpen(MON_HOURS, utc('2026-09-14T09:59:00.000Z'))).toBe(
        false,
      );
    });

    it('segunda 07:00 SP → fechado (bug original: 10:00Z)', () => {
      expect(computeIsOpen(MON_HOURS, utc('2026-09-14T10:00:00.000Z'))).toBe(
        false,
      );
    });

    it('segunda 09:59 SP → fechado', () => {
      expect(computeIsOpen(MON_HOURS, utc('2026-09-14T12:59:00.000Z'))).toBe(
        false,
      );
    });

    it('segunda 10:00 SP → aberto', () => {
      expect(computeIsOpen(MON_HOURS, utc('2026-09-14T13:00:00.000Z'))).toBe(
        true,
      );
    });

    it('segunda 22:59 SP → aberto', () => {
      expect(computeIsOpen(MON_HOURS, utc('2026-09-15T01:59:00.000Z'))).toBe(
        true,
      );
    });

    it('segunda 23:00 SP → fechado', () => {
      expect(computeIsOpen(MON_HOURS, utc('2026-09-15T02:00:00.000Z'))).toBe(
        false,
      );
    });
  });

  describe('mudança de dia UTC', () => {
    it('segunda 22:00 SP usa horários de segunda mesmo já sendo terça em UTC', () => {
      expect(computeIsOpen(MON_HOURS, utc('2026-09-15T01:00:00.000Z'))).toBe(
        true,
      );
    });
  });

  describe('overnight sexta 20:00–02:00 / sábado 12:00–22:00', () => {
    it('sexta 19:59 SP → fechado', () => {
      expect(computeIsOpen(OVERNIGHT, utc('2026-09-18T22:59:00.000Z'))).toBe(
        false,
      );
    });

    it('sexta 20:00 SP → aberto', () => {
      expect(computeIsOpen(OVERNIGHT, utc('2026-09-18T23:00:00.000Z'))).toBe(
        true,
      );
    });

    it('sexta 23:59 SP → aberto', () => {
      expect(computeIsOpen(OVERNIGHT, utc('2026-09-19T02:59:00.000Z'))).toBe(
        true,
      );
    });

    it('sábado 00:00 SP → aberto (extensão de sexta)', () => {
      expect(computeIsOpen(OVERNIGHT, utc('2026-09-19T03:00:00.000Z'))).toBe(
        true,
      );
    });

    it('sábado 01:59 SP → aberto', () => {
      expect(computeIsOpen(OVERNIGHT, utc('2026-09-19T04:59:00.000Z'))).toBe(
        true,
      );
    });

    it('sábado 02:00 SP → fechado', () => {
      expect(computeIsOpen(OVERNIGHT, utc('2026-09-19T05:00:00.000Z'))).toBe(
        false,
      );
    });

    it('sábado 11:00 SP → fechado', () => {
      expect(computeIsOpen(OVERNIGHT, utc('2026-09-19T14:00:00.000Z'))).toBe(
        false,
      );
    });

    it('sábado 12:00 SP → aberto', () => {
      expect(computeIsOpen(OVERNIGHT, utc('2026-09-19T15:00:00.000Z'))).toBe(
        true,
      );
    });
  });

  describe('overnight + dia atual fechado', () => {
    const hours = {
      fri: { open: '20:00', close: '02:00' },
      sat: { closed: true },
    };

    it('sábado 01:00 SP → aberto por causa de sexta', () => {
      expect(computeIsOpen(hours, utc('2026-09-19T04:00:00.000Z'))).toBe(true);
    });

    it('sábado 02:00 SP → fechado', () => {
      expect(computeIsOpen(hours, utc('2026-09-19T05:00:00.000Z'))).toBe(false);
    });
  });

  describe('wrap-around domingo → segunda', () => {
    const hours = {
      sun: { open: '20:00', close: '02:00' },
      mon: { open: '10:00', close: '22:00' },
    };

    it('segunda 01:00 SP → aberto pelo domingo', () => {
      expect(computeIsOpen(hours, utc('2026-09-14T04:00:00.000Z'))).toBe(true);
    });
  });

  describe('dados inválidos', () => {
    const mondayNoon = utc('2026-09-14T15:00:00.000Z');

    it('hoursJson null → null', () => {
      expect(computeIsOpen(null, mondayNoon)).toBeNull();
    });

    it('objeto sem o dia atual → null', () => {
      expect(computeIsOpen({}, mondayNoon)).toBeNull();
    });

    it('open inválido → null', () => {
      expect(
        computeIsOpen(
          { mon: { open: 'xx', close: '22:00' } },
          mondayNoon,
        ),
      ).toBeNull();
    });

    it('close inválido → null', () => {
      expect(
        computeIsOpen(
          { mon: { open: '10:00', close: '25:00' } },
          mondayNoon,
        ),
      ).toBeNull();
    });
  });

  describe('open == close', () => {
    it('00:00–00:00 permanece fechado (sem convenção 24h)', () => {
      expect(
        computeIsOpen(
          { mon: { open: '00:00', close: '00:00' } },
          utc('2026-09-14T15:00:00.000Z'),
        ),
      ).toBe(false);
    });
  });
});

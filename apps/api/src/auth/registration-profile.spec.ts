import {
  WEB_REGISTRATION_CHANNEL,
  declaresWebRegistration,
  resolveRegistrationProfile,
} from './registration-profile';
import { AGE_BAND_REQUIRED } from '../users/age-band';
import { VENUE_DOCUMENT_REQUIRED } from '../venues/venue-document';

const WEB = ['https://app-after.com.br', 'http://localhost:8080'];

describe('registration profile', () => {
  it('store mobile payload sem campos extras é legacy', () => {
    expect(
      resolveRegistrationProfile('USER', {}, undefined, WEB).mode,
    ).toBe('legacy_mobile');
    expect(
      resolveRegistrationProfile('VENUE', {}, undefined, WEB).mode,
    ).toBe('legacy_mobile');
  });

  it('Origin web permitido exige cadastro enriquecido', () => {
    expect(() =>
      resolveRegistrationProfile(
        'USER',
        {},
        'https://app-after.com.br',
        WEB,
      ),
    ).toThrow(AGE_BAND_REQUIRED);
    expect(() =>
      resolveRegistrationProfile(
        'VENUE',
        {},
        'https://app-after.com.br',
        WEB,
      ),
    ).toThrow(VENUE_DOCUMENT_REQUIRED);
  });

  it('canal after_web exige cadastro enriquecido mesmo sem Origin', () => {
    expect(() =>
      resolveRegistrationProfile(
        'USER',
        { registrationChannel: WEB_REGISTRATION_CHANNEL },
        undefined,
        WEB,
      ),
    ).toThrow(AGE_BAND_REQUIRED);
  });

  it('Origin web com faixa e documento válidos entra no modo enriched', () => {
    const user = resolveRegistrationProfile(
      'USER',
      { ageBand: 'AGE_19_35', registrationChannel: WEB_REGISTRATION_CHANNEL },
      undefined,
      WEB,
    );
    expect(user.mode).toBe('enriched');
    expect(user.ageBand).toBe('AGE_19_35');

    const venue = resolveRegistrationProfile(
      'VENUE',
      {
        documentType: 'CPF',
        documentNumber: '123.456.789-09',
        registrationChannel: WEB_REGISTRATION_CHANNEL,
      },
      undefined,
      WEB,
    );
    expect(venue.mode).toBe('enriched');
    expect(venue.venueDocument?.documentDigits).toBe('12345678909');
  });

  it('cabeçalho de versão sozinho não classifica como web', () => {
    expect(
      declaresWebRegistration(
        { registrationChannel: 'ios-1.0.2-18' as typeof WEB_REGISTRATION_CHANNEL },
        undefined,
        WEB,
      ),
    ).toBe(false);
  });

  it('payload parcial fora do web exige faixa em vez de cair no legacy', () => {
    expect(() =>
      resolveRegistrationProfile(
        'USER',
        { documentType: 'CPF' },
        undefined,
        WEB,
      ),
    ).toThrow(AGE_BAND_REQUIRED);
  });
});

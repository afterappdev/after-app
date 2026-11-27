import { afterEach, describe, expect, it } from '@jest/globals';
import { venueClaimsNotifyEmail } from './venue-claim-mail';

describe('venueClaimsNotifyEmail', () => {
  const previous = process.env.VENUE_CLAIMS_NOTIFY_EMAIL;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.VENUE_CLAIMS_NOTIFY_EMAIL;
    } else {
      process.env.VENUE_CLAIMS_NOTIFY_EMAIL = previous;
    }
  });

  it('usa contato@app-after.com.br quando a variável não está definida', () => {
    delete process.env.VENUE_CLAIMS_NOTIFY_EMAIL;
    expect(venueClaimsNotifyEmail()).toBe('contato@app-after.com.br');
  });

  it('respeita VENUE_CLAIMS_NOTIFY_EMAIL quando definida', () => {
    process.env.VENUE_CLAIMS_NOTIFY_EMAIL = 'outro@after.local';
    expect(venueClaimsNotifyEmail()).toBe('outro@after.local');
  });
});
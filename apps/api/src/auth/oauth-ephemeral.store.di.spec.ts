import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { OAuthEphemeralStore } from './oauth-ephemeral.store';

describe('OAuthEphemeralStore Nest DI', () => {
  it('não declara Function como dependência de constructor', () => {
    const paramtypes =
      (Reflect.getMetadata('design:paramtypes', OAuthEphemeralStore) as unknown[]) ??
      [];
    expect(paramtypes).toEqual([]);
    expect(paramtypes).not.toContain(Function);
  });

  it('Nest consegue instanciar o provider sem resolver Function', async () => {
    const module = await Test.createTestingModule({
      providers: [OAuthEphemeralStore],
    }).compile();

    const store = module.get(OAuthEphemeralStore);
    expect(store).toBeInstanceOf(OAuthEphemeralStore);

    store.putSession('state-di', {
      nonce: 'nonce-di',
      redirect: 'https://app-after.com.br/',
    });
    expect(store.consumeSession('state-di')).toEqual(
      expect.objectContaining({ nonce: 'nonce-di' }),
    );
    expect(store.consumeSession('state-di')).toBeNull();

    await module.close();
  });
});

import { CREDIT_PACKAGES } from '../common/constants/credits';
import { VIP_CREDIT_PACKAGES } from './vip-catalog';
import {
  STORE_CONFIRM_PACKAGE_KEYS,
  isVipStorePackage,
  resolveStorePackageByProductId,
} from './store-catalog';

describe('store-catalog', () => {
  it('inclui pacotes comuns e VIP nas chaves de store-confirm', () => {
    expect(STORE_CONFIRM_PACKAGE_KEYS).toEqual([
      ...CREDIT_PACKAGES.map((p) => p.key),
      ...VIP_CREDIT_PACKAGES.map((p) => p.key),
    ]);
  });

  it('resolve VIP por productId', () => {
    const pack = resolveStorePackageByProductId('after.credits.vip.1');
    expect(pack?.key).toBe('vip_unit_1');
    expect(pack && isVipStorePackage(pack)).toBe(true);
  });

  it('rejeita productId desconhecido', () => {
    expect(resolveStorePackageByProductId('after.creditsvip.1')).toBeNull();
  });
});

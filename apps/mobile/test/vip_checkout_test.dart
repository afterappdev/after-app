import 'package:flutter_test/flutter_test.dart';

import 'package:after_app/features/credits/billing_channel.dart';
import 'package:after_app/features/credits/credits_ui.dart';

const _officialVip = {
  'key': 'vip_unit_1',
  'modality': 'VIP',
  'credits': 1,
  'referencePriceBrl': 99.9,
  'currency': 'BRL',
  'storeProductId': 'after.credits.vip.1',
  'storePriceBrl': null,
};

void main() {
  group('nativeVipStoreCheckoutReady', () {
    test('aceita pacote oficial', () {
      expect(nativeVipStoreCheckoutReady(_officialVip), isTrue);
    });

    test('rejeita productId desconhecido', () {
      expect(
        nativeVipStoreCheckoutReady({
          ..._officialVip,
          'storeProductId': 'after.credits.vip.2',
        }),
        isFalse,
      );
    });

    test('rejeita package key desconhecida', () {
      expect(
        nativeVipStoreCheckoutReady({
          ..._officialVip,
          'key': 'vip_unit_2',
        }),
        isFalse,
      );
    });

    test('rejeita créditos diferentes de 1', () {
      expect(
        nativeVipStoreCheckoutReady({
          ..._officialVip,
          'credits': 2,
        }),
        isFalse,
      );
    });

    test('rejeita oferta sem preço de referência', () {
      expect(
        nativeVipStoreCheckoutReady({
          'key': 'vip_unit_1',
          'modality': 'VIP',
          'credits': 1,
          'storeProductId': 'after.credits.vip.1',
        }),
        isFalse,
      );
    });
  });

  group('vipPackageCheckoutAvailable', () {
    test('nativo disponível com catálogo pronto', () {
      expect(
        vipPackageCheckoutAvailable(
          vipOffer: Map<String, dynamic>.from(_officialVip),
          vipCheckoutReady: true,
          usePixCheckout: false,
        ),
        isTrue,
      );
    });

    test('nativo bloqueado sem checkoutReady', () {
      expect(
        vipPackageCheckoutAvailable(
          vipOffer: Map<String, dynamic>.from(_officialVip),
          vipCheckoutReady: false,
          usePixCheckout: false,
        ),
        isFalse,
      );
    });

    test('PIX continua exigindo vipWebCheckoutPack', () {
      expect(
        vipPackageCheckoutAvailable(
          vipOffer: Map<String, dynamic>.from(_officialVip),
          vipCheckoutReady: true,
          usePixCheckout: true,
        ),
        isTrue,
      );
    });

    test('iOS nativo não habilita PIX para VIP desconhecido', () {
      expect(
        vipPackageCheckoutAvailable(
          vipOffer: {
            ..._officialVip,
            'storeProductId': 'after.credits.vip.99',
          },
          vipCheckoutReady: true,
          usePixCheckout: false,
        ),
        isFalse,
      );
    });
  });

  group('store-confirm contrato produção', () {
    test('corpo VIP Apple para API e104e75', () {
      const jws = 'eyJhbGciOiJFUzI1NiJ9.payload.sig';
      final body = storeConfirmBody(
        packageKey: 'vip_unit_1',
        productId: 'after.credits.vip.1',
        provider: 'app_store',
        purchaseId: '2000000123456789',
        verificationData: jws,
      );
      expect(body['packageKey'], 'vip_unit_1');
      expect(body['productId'], 'after.credits.vip.1');
      expect(body['provider'], 'app_store');
      expect(body['verificationData'], jws);
      expect(body['purchaseId'], '2000000123456789');
    });
  });
}
